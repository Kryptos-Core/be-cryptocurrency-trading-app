import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ethers } from 'ethers';
import { TronWeb } from 'tronweb';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { uuidv7 } from 'uuidv7';
import { WalletEncryptionService } from '@/common/services';
import {
  BadRequestException,
  BusinessException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@/common/exceptions';
import { RedisService } from '@/common/services/redis.service';
import { PaymentConfigService } from '@/modules/payment-config/payment-config.service';
import { BlockchainGatewayConfig } from '@/modules/payment-config/interfaces/payment-gateway-config.interface';
import {
  TreasuryMainWallet,
  TreasuryMainWalletChain,
  TreasuryMainWalletStatus,
} from '@/entities/treasury-main-wallet.entity';
import { TransactionWalletService } from './transaction-wallet.service';
import { TreasuryMainWalletRepository } from './repositories/treasury-main-wallet.repository';
import { ImportMainWalletDto } from './dto';
import {
  BLOCKCHAIN_CHAIN_DB_VALUES,
  type BlockchainChainDbValue,
} from '@/common/constants/blockchain-chain-db';
import { UserRole } from '@/common/enums';

export type SupportedTreasuryChain = TreasuryMainWalletChain;

export interface MainWalletDto {
  mainWalletId: string;
  chain: SupportedTreasuryChain;
  address: string;
  label: string | null;
  balance: string;
  symbol: string;
  /** TRON: USDT (TRC-20) human balance; null when not applicable or unknown */
  usdtTrc20Balance: string | null;
  isDefault: boolean;
  status: TreasuryMainWalletStatus;
  createdBy: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  rejectedBy: string | null;
  rejectedAt: string | null;
  lastRotatedAt: string | null;
  rotationIntervalDays: number | null;
  createdAt: string;
}

/** Redis Pub/Sub channel for main wallet lifecycle events */
export const TREASURY_MAIN_WALLET_EVENTS_CHANNEL = 'treasury:main_wallet_events';

@Injectable()
export class TreasuryMainWalletService implements OnModuleInit {
  private readonly logger = new Logger(TreasuryMainWalletService.name);

  constructor(
    private readonly mainWalletRepository: TreasuryMainWalletRepository,
    private readonly walletEncryptionService: WalletEncryptionService,
    private readonly redisService: RedisService,
    private readonly paymentConfigService: PaymentConfigService,
    private readonly transactionWalletService: TransactionWalletService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seedFromPaymentConfigIfEmpty();
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Read API
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  async listByChain(chain: SupportedTreasuryChain): Promise<MainWalletDto[]> {
    const wallets = await this.mainWalletRepository.findByChainForList(chain);

    if (wallets.length > 0) {
      return Promise.all(wallets.map((w) => this.toDto(w)));
    }

    return this.getSyntheticFromPaymentConfig(chain);
  }

  async listPendingApproval(): Promise<MainWalletDto[]> {
    const wallets = await this.mainWalletRepository.findPendingApprovalList();
    return Promise.all(wallets.map((w) => this.toDto(w)));
  }

  async getById(mainWalletId: string): Promise<TreasuryMainWallet> {
    const wallet = await this.mainWalletRepository.findByMainWalletId(mainWalletId);
    if (!wallet) {
      throw new NotFoundException('Treasury main wallet', mainWalletId);
    }
    return wallet;
  }

  decryptPrivateKey(wallet: TreasuryMainWallet): string {
    return this.walletEncryptionService.decrypt(wallet.encrypted_private_key);
  }

  /** Public address only — no throw when no default ACTIVE wallet (e.g. deposit methods list). */
  async getDefaultActiveMainWalletAddressOrNull(chain: string): Promise<string | null> {
    if (!BLOCKCHAIN_CHAIN_DB_VALUES.includes(chain as BlockchainChainDbValue)) {
      return null;
    }
    const defaultWallet = await this.mainWalletRepository.findActiveDefaultOnChain(
      chain as TreasuryMainWalletChain,
    );
    return defaultWallet?.address ?? null;
  }

  async getMainWalletAddress(
    chain: SupportedTreasuryChain,
    mainWalletId?: string,
  ): Promise<string> {
    if (mainWalletId && mainWalletId !== 'payment-config-default') {
      const wallet = await this.getById(mainWalletId);
      if (wallet.chain !== chain) {
        throw new Error(`Main wallet ${mainWalletId} does not match chain ${chain}`);
      }
      return wallet.address;
    }

    const defaultWallet = await this.mainWalletRepository.findActiveDefaultOnChain(chain);
    if (defaultWallet) return defaultWallet.address;

    throw new BusinessException(
      `No active default main wallet configured for chain ${chain}. Import one via POST /treasury/main-wallets.`,
      'TREASURY_MAIN_WALLET_NOT_CONFIGURED',
    );
  }

  /**
   * Resolve the private key for the active default main wallet on a given chain.
   * Used by sweep/fund operations. No .env fallback — DB is the single source of truth.
   */
  async resolveMainWalletPrivateKey(chain: SupportedTreasuryChain): Promise<string> {
    const wallet = await this.mainWalletRepository.findActiveDefaultOnChain(chain);

    if (!wallet) {
      throw new BusinessException(
        `No active default main wallet configured for chain ${chain}. `
        + `Import via POST /treasury/main-wallets (Finance/Admin activates immediately).`,
        'TREASURY_MAIN_WALLET_NOT_CONFIGURED',
      );
    }

    return this.walletEncryptionService.decrypt(wallet.encrypted_private_key);
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Write API — Import / Approve / Reject / SetDefault / Delete
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /**
   * Import a main wallet from private key.
   * MFA code is verified by the controller BEFORE calling this method.
   * Finance Manager and Admin: ACTIVE immediately (self-approved, same default rules as Risk approve).
   * Other roles (if ever allowed): PENDING_APPROVAL.
   */
  async importMainWallet(
    dto: ImportMainWalletDto,
    createdByUserId: string,
    actorRole: UserRole,
  ): Promise<MainWalletDto> {
    const chain = this.assertSupportedChain(dto.chain);
    const address = this.deriveAddress(chain, dto.privateKey.trim());
    const encrypted = this.walletEncryptionService.encrypt(dto.privateKey.trim());

    // Check for duplicate address on this chain
    const existing = await this.mainWalletRepository.findByChainAndAddress(chain, address);
    if (existing) {
      throw new ConflictException(
        `A main wallet with address ${address} already exists for chain ${chain}`,
        'TREASURY_MAIN_WALLET_DUPLICATE',
      );
    }

    const selfActivate =
      actorRole === UserRole.FINANCE_MANAGER || actorRole === UserRole.ADMIN;

    let status: TreasuryMainWalletStatus;
    let approvedBy: string | null;
    let approvedAt: Date | null;
    let isDefault = false;

    if (selfActivate) {
      const hasActiveDefault = await this.mainWalletRepository.findActiveDefaultOnChain(chain);
      status = 'ACTIVE';
      approvedBy = createdByUserId;
      approvedAt = new Date();
      if (!hasActiveDefault) {
        isDefault = true;
        this.logger.log(`Auto-set as default for chain ${chain} on import (self-activate)`);
      }
    } else {
      status = 'PENDING_APPROVAL';
      approvedBy = null;
      approvedAt = null;
    }

    const created = await this.mainWalletRepository.saveNew({
      main_wallet_id: uuidv7(),
      chain,
      address,
      encrypted_private_key: encrypted,
      label: dto.label?.trim() ?? null,
      is_default: isDefault,
      status,
      created_by: createdByUserId,
      approved_by: approvedBy,
      approved_at: approvedAt,
      rejected_by: null,
      rejected_at: null,
      last_rotated_at: null,
      rotation_interval_days: null,
    });

    if (selfActivate) {
      this.logger.log(
        `Main wallet ACTIVE (import, self-approved): chain=${chain}, address=${address}, createdBy=${createdByUserId}`,
      );
      await this.publishEvent('main_wallet.approved', {
        mainWalletId: created.main_wallet_id,
        chain,
        address,
        approvedBy: createdByUserId,
        isDefault: created.is_default,
      });
    } else {
      this.logger.log(
        `Main wallet PENDING_APPROVAL: chain=${chain}, address=${address}, createdBy=${createdByUserId}`,
      );
      await this.publishEvent('main_wallet.pending_approval', {
        mainWalletId: created.main_wallet_id,
        chain,
        address,
        createdBy: createdByUserId,
      });
    }

    return this.toDto(created);
  }

  /**
   * Risk Officer approves a pending main wallet.
   * If no active default exists for this chain → auto-set as default.
   */
  async approveMainWallet(
    mainWalletId: string,
    approverUserId: string,
  ): Promise<MainWalletDto> {
    const wallet = await this.getById(mainWalletId);

    if (wallet.status !== 'PENDING_APPROVAL') {
      throw new BadRequestException(
        `Wallet ${mainWalletId} is not in PENDING_APPROVAL status (current: ${wallet.status})`,
        'TREASURY_MAIN_WALLET_NOT_PENDING',
      );
    }

    // Auto-set default if no active default exists for this chain
    const hasActiveDefault = await this.mainWalletRepository.findActiveDefaultOnChain(wallet.chain);

    wallet.status = 'ACTIVE';
    wallet.approved_by = approverUserId;
    wallet.approved_at = new Date();
    if (!hasActiveDefault) {
      wallet.is_default = true;
      this.logger.log(`Auto-set as default for chain ${wallet.chain}: ${wallet.main_wallet_id}`);
    }

    const updated = await this.mainWalletRepository.saveWallet(wallet);

    this.logger.log(`Main wallet APPROVED: ${mainWalletId} by ${approverUserId}`);
    await this.publishEvent('main_wallet.approved', {
      mainWalletId,
      chain: wallet.chain,
      address: wallet.address,
      approvedBy: approverUserId,
      isDefault: updated.is_default,
    });

    return this.toDto(updated);
  }

  /**
   * Risk Officer rejects a pending main wallet.
   */
  async rejectMainWallet(
    mainWalletId: string,
    rejectorUserId: string,
  ): Promise<MainWalletDto> {
    const wallet = await this.getById(mainWalletId);

    if (wallet.status !== 'PENDING_APPROVAL') {
      throw new BadRequestException(
        `Wallet ${mainWalletId} is not in PENDING_APPROVAL status (current: ${wallet.status})`,
        'TREASURY_MAIN_WALLET_NOT_PENDING',
      );
    }

    wallet.status = 'REJECTED';
    wallet.rejected_by = rejectorUserId;
    wallet.rejected_at = new Date();

    const updated = await this.mainWalletRepository.saveWallet(wallet);

    this.logger.log(`Main wallet REJECTED: ${mainWalletId} by ${rejectorUserId}`);
    await this.publishEvent('main_wallet.rejected', {
      mainWalletId,
      chain: wallet.chain,
      rejectedBy: rejectorUserId,
    });

    return this.toDto(updated);
  }

  /**
   * Set a specific ACTIVE main wallet as the default for its chain.
   */
  async setDefault(mainWalletId: string, actorUserId: string): Promise<MainWalletDto> {
    const wallet = await this.getById(mainWalletId);

    if (wallet.status !== 'ACTIVE') {
      throw new BadRequestException(
        `Only ACTIVE wallets can be set as default (current: ${wallet.status})`,
        'TREASURY_MAIN_WALLET_NOT_ACTIVE',
      );
    }

    await this.mainWalletRepository.clearDefaultAndSetMainWallet(wallet.chain, mainWalletId);

    const updated = await this.mainWalletRepository.findByMainWalletId(mainWalletId);

    this.logger.log(`Main wallet set as default: ${mainWalletId} (chain=${wallet.chain}) by ${actorUserId}`);
    await this.publishEvent('main_wallet.default_changed', {
      mainWalletId,
      chain: wallet.chain,
      address: wallet.address,
      changedBy: actorUserId,
    });

    return this.toDto(updated!);
  }

  /**
   * Returns decrypted private key — caller must enforce MFA (controller).
   */
  async revealPrivateKey(mainWalletId: string, actorUserId: string): Promise<{ privateKey: string }> {
    const wallet = await this.getById(mainWalletId);
    const privateKey = this.decryptPrivateKey(wallet);
    this.logger.log(`Main wallet private key revealed (audit): ${mainWalletId} by ${actorUserId}`);
    return { privateKey };
  }

  async updateMainWalletLabel(
    mainWalletId: string,
    label: string | null | undefined,
    actorUserId: string,
  ): Promise<MainWalletDto> {
    const existing = await this.getById(mainWalletId);
    if (label === undefined) {
      return await this.toDto(existing);
    }
    const trimmed = label === null || label.trim() === '' ? null : label.trim();
    await this.mainWalletRepository.updateLabel(mainWalletId, trimmed);
    const updated = await this.getById(mainWalletId);
    this.logger.log(`Main wallet label updated: ${mainWalletId} by ${actorUserId}`);
    return await this.toDto(updated);
  }

  /**
   * Finance/Admin requests deletion — wallet becomes PENDING_DELETION until Risk approves.
   * Same default rule as hard delete: cannot request removal of default while other ACTIVE wallets exist.
   */
  async requestMainWalletDeletion(mainWalletId: string, actorUserId: string): Promise<MainWalletDto> {
    const wallet = await this.getById(mainWalletId);

    if (wallet.status !== 'ACTIVE') {
      throw new BadRequestException(
        `Only ACTIVE wallets can be marked for deletion (current: ${wallet.status})`,
        'TREASURY_MAIN_WALLET_NOT_ACTIVE',
      );
    }

    if (wallet.is_default) {
      const othersCount = await this.mainWalletRepository.countActiveOthersOnChainExcluding(
        wallet.chain,
        mainWalletId,
      );
      if (othersCount > 0) {
        throw new ForbiddenException(
          'Cannot remove the current default main wallet while other active wallets exist for this chain. Set another as default first.',
        );
      }
    }

    wallet.status = 'PENDING_DELETION';
    const updated = await this.mainWalletRepository.saveWallet(wallet);

    this.logger.log(`Main wallet PENDING_DELETION: ${mainWalletId} (chain=${wallet.chain}) by ${actorUserId}`);
    await this.publishEvent('main_wallet.deletion_pending', {
      mainWalletId,
      chain: wallet.chain,
      address: wallet.address,
      requestedBy: actorUserId,
    });

    return this.toDto(updated);
  }

  /**
   * Risk Officer: approve pending deletion — row removed from DB.
   */
  async approveMainWalletDeletion(mainWalletId: string, approverUserId: string): Promise<void> {
    const wallet = await this.getById(mainWalletId);
    if (wallet.status !== 'PENDING_DELETION') {
      throw new BadRequestException(
        `Wallet ${mainWalletId} is not pending deletion (current: ${wallet.status})`,
        'TREASURY_MAIN_WALLET_NOT_PENDING_DELETION',
      );
    }
    await this.executeHardDeleteMainWallet(mainWalletId, approverUserId, wallet);
  }

  /**
   * Risk Officer: reject deletion request — wallet back to ACTIVE.
   */
  async rejectMainWalletDeletion(mainWalletId: string, rejectorUserId: string): Promise<MainWalletDto> {
    const wallet = await this.getById(mainWalletId);
    if (wallet.status !== 'PENDING_DELETION') {
      throw new BadRequestException(
        `Wallet ${mainWalletId} is not pending deletion (current: ${wallet.status})`,
        'TREASURY_MAIN_WALLET_NOT_PENDING_DELETION',
      );
    }

    wallet.status = 'ACTIVE';
    const updated = await this.mainWalletRepository.saveWallet(wallet);

    this.logger.log(`Main wallet deletion REJECTED (restored ACTIVE): ${mainWalletId} by ${rejectorUserId}`);
    await this.publishEvent('main_wallet.deletion_rejected', {
      mainWalletId,
      chain: wallet.chain,
      rejectedBy: rejectorUserId,
    });

    return this.toDto(updated);
  }

  /**
   * Permanently delete a main wallet row (after Risk approval). Validates default rule.
   */
  private async executeHardDeleteMainWallet(
    mainWalletId: string,
    actorUserId: string,
    wallet: TreasuryMainWallet,
  ): Promise<void> {
    if (wallet.is_default) {
      const othersCount = await this.mainWalletRepository.countActiveOthersOnChainExcluding(
        wallet.chain,
        mainWalletId,
      );
      if (othersCount > 0) {
        throw new ForbiddenException(
          'Cannot delete the current default main wallet while other active wallets exist for this chain. Set another as default first.',
        );
      }
    }

    await this.mainWalletRepository.deleteByMainWalletId(mainWalletId);

    this.logger.log(`Main wallet deleted: ${mainWalletId} (chain=${wallet.chain}) by ${actorUserId}`);
    await this.publishEvent('main_wallet.deleted', {
      mainWalletId,
      chain: wallet.chain,
      address: wallet.address,
      deletedBy: actorUserId,
    });
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Auto-rotation support (called by scheduler)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /**
   * Mark a wallet as rotated (update last_rotated_at).
   * Called after rotation sweep completes.
   */
  async markRotated(mainWalletId: string): Promise<void> {
    await this.mainWalletRepository.updateLastRotatedAt(mainWalletId, new Date());
  }

  /**
   * Get all ACTIVE default wallets that are due for rotation based on their
   * `rotation_interval_days` (or the globalIntervalDays fallback).
   */
  async getWalletsDueForRotation(globalIntervalDays: number): Promise<TreasuryMainWallet[]> {
    const allDefaults = await this.mainWalletRepository.findAllActiveDefaults();

    const now = new Date();
    return allDefaults.filter((w) => {
      const interval = w.rotation_interval_days ?? globalIntervalDays;
      if (!w.last_rotated_at) return true; // Never rotated → due
      const daysSince = (now.getTime() - w.last_rotated_at.getTime()) / (1000 * 60 * 60 * 24);
      return daysSince >= interval;
    });
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Private helpers
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  private async toDto(w: TreasuryMainWallet): Promise<MainWalletDto> {
    let balance = '0';
    let symbol = '';
    let usdtTrc20Balance: string | null = null;
    try {
      const result = await this.transactionWalletService.getBalanceCached(w.chain as any, w.address);
      balance = result.balance;
      symbol = result.symbol;
      usdtTrc20Balance = result.usdtTrc20Balance ?? null;
    } catch {
      // Balance fetch is best-effort — Solana devnet may be unavailable
    }
    return {
      mainWalletId: w.main_wallet_id,
      chain: w.chain,
      address: w.address,
      label: w.label,
      balance,
      symbol,
      usdtTrc20Balance,
      isDefault: w.is_default,
      status: w.status,
      createdBy: w.created_by,
      approvedBy: w.approved_by,
      approvedAt: w.approved_at?.toISOString() ?? null,
      rejectedBy: w.rejected_by,
      rejectedAt: w.rejected_at?.toISOString() ?? null,
      lastRotatedAt: w.last_rotated_at?.toISOString() ?? null,
      rotationIntervalDays: w.rotation_interval_days,
      createdAt: w.created_at.toISOString(),
    };
  }

  private async getSyntheticFromPaymentConfig(
    chain: SupportedTreasuryChain,
  ): Promise<MainWalletDto[]> {
    // Synthetic read-only fallback during first boot (before seed completes)
    try {
      const config = await this.getPaymentConfigForChain(chain);
      if (!config?.hotWalletPrivateKey) return [];
      const address = this.deriveAddress(chain, config.hotWalletPrivateKey);
      let balance = '0';
      let symbol = '';
      let usdtTrc20Balance: string | null = null;
      try {
        const r = await this.transactionWalletService.getBalanceCached(chain as any, address);
        balance = r.balance;
        symbol = r.symbol;
        usdtTrc20Balance = r.usdtTrc20Balance ?? null;
      } catch { /* best-effort */ }
      return [{
        mainWalletId: 'payment-config-default',
        chain,
        address,
        label: null,
        balance,
        symbol,
        usdtTrc20Balance,
        isDefault: true,
        status: 'ACTIVE',
        createdBy: null,
        approvedBy: null,
        approvedAt: null,
        rejectedBy: null,
        rejectedAt: null,
        lastRotatedAt: null,
        rotationIntervalDays: null,
        createdAt: new Date().toISOString(),
      }];
    } catch {
      return [];
    }
  }

  /**
   * One-time seed at startup: if treasury_main_wallets is empty,
   * import from PaymentConfig (backward compatible with existing deployments).
   */
  private async seedFromPaymentConfigIfEmpty(): Promise<void> {
    const count = await this.mainWalletRepository.countAll();
    if (count > 0) return;

    const chains: SupportedTreasuryChain[] = [
      'ETH_MAINNET',
      'BSC_MAINNET',
      'TRON_MAINNET',
      'SOLANA_MAINNET',
    ];

    for (const chain of chains) {
      try {
        const config = await this.getPaymentConfigForChain(chain);
        if (!config?.hotWalletPrivateKey) continue;

        const address = this.deriveAddress(chain, config.hotWalletPrivateKey);
        const encrypted = this.walletEncryptionService.encrypt(config.hotWalletPrivateKey);

        await this.mainWalletRepository.saveNew({
          main_wallet_id: uuidv7(),
          chain,
          address,
          encrypted_private_key: encrypted,
          label: `${chain} (migrated from PaymentConfig)`,
          is_default: true,
          // Seeded records bypass approval workflow — treated as ACTIVE
          status: 'ACTIVE' as TreasuryMainWalletStatus,
          created_by: null,
          approved_by: null,
          approved_at: null,
          rejected_by: null,
          rejected_at: null,
          last_rotated_at: null,
          rotation_interval_days: null,
        });
        this.logger.log(`Seeded treasury main wallet for ${chain} (address: ${address})`);
      } catch (err) {
        this.logger.warn(`Could not seed main wallet for ${chain}: ${(err as Error).message}`);
      }
    }
  }

  private async getPaymentConfigForChain(
    chain: SupportedTreasuryChain,
  ): Promise<BlockchainGatewayConfig | null> {
    const mapping: Partial<Record<SupportedTreasuryChain, [string, string]>> = {
      ETH_MAINNET: ['ETH', 'MAINNET'],
      BSC_MAINNET: ['BSC', 'MAINNET'],
      TRON_MAINNET: ['TRON', 'MAINNET'],
      SOLANA_MAINNET: ['SOL', 'MAINNET'],
    };
    const entry = mapping[chain];
    if (!entry) return null;
    const [type, network] = entry;
    return this.paymentConfigService.getActiveConfig(
      type as 'ETH' | 'TRON' | 'SOL' | 'BSC',
      network,
    ) as Promise<BlockchainGatewayConfig | null>;
  }

  /**
   * Derive blockchain address from private key — supports ETH, TRON, Solana.
   */
  private deriveAddress(chain: SupportedTreasuryChain, privateKey: string): string {
    const throwInvalid = (hint: string): never => {
      throw new BadRequestException(
        `Invalid private key for chain ${chain}. ${hint}`,
        'TREASURY_INVALID_PRIVATE_KEY',
      );
    };

    if (
      chain === 'ETH_MAINNET' ||
      chain === 'BSC_MAINNET' ||
      chain === 'BSC_CHAPEL'
    ) {
      try {
        return new ethers.Wallet(privateKey).address;
      } catch {
        throwInvalid(
          'Use a 32-byte hex private key (64 hex characters, optional 0x prefix). Do not paste your wallet address.',
        );
      }
    }
    if (chain === 'SOLANA_MAINNET' || chain === 'SOLANA_DEVNET') {
      try {
        const decoded = bs58.decode(privateKey);
        const keypair = Keypair.fromSecretKey(decoded);
        return keypair.publicKey.toBase58();
      } catch {
        throwInvalid('Use a valid Solana secret key (Base58-encoded byte array).');
      }
    }
    // TRON — hex private key; Base58 strings starting with T are addresses, not keys
    let pk = privateKey.trim();
    if (pk.startsWith('0x') || pk.startsWith('0X')) {
      pk = pk.slice(2);
    }
    const derived = TronWeb.address.fromPrivateKey(pk);
    if (derived === false) {
      throwInvalid(
        'Use a 32-byte hex private key (64 hex characters). TRON addresses (Base58 starting with T) are not private keys.',
      );
    }
    const tronAddress = derived as string;
    if (tronAddress.length === 0) {
      throwInvalid(
        'Use a 32-byte hex private key (64 hex characters). TRON addresses (Base58 starting with T) are not private keys.',
      );
    }
    return tronAddress;
  }

  private assertSupportedChain(chain: string): SupportedTreasuryChain {
    if (!BLOCKCHAIN_CHAIN_DB_VALUES.includes(chain as SupportedTreasuryChain)) {
      throw new BadRequestException(
        `Unsupported chain: ${chain}. Supported: ${BLOCKCHAIN_CHAIN_DB_VALUES.join(', ')}`,
        'TREASURY_CHAIN_UNSUPPORTED',
      );
    }
    return chain as SupportedTreasuryChain;
  }

  private async publishEvent(event: string, payload: Record<string, unknown>): Promise<void> {
    try {
      await this.redisService.publish(
        TREASURY_MAIN_WALLET_EVENTS_CHANNEL,
        JSON.stringify({ event, payload, timestamp: new Date().toISOString() }),
      );
    } catch (err) {
      this.logger.warn(`Failed to publish main wallet event ${event}: ${(err as Error).message}`);
    }
  }
}
