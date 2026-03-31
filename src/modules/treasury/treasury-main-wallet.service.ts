import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DataSource, Not } from 'typeorm';
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
import { ImportMainWalletDto } from './dto';

export type SupportedTreasuryChain = TreasuryMainWalletChain;

export interface MainWalletDto {
  mainWalletId: string;
  chain: SupportedTreasuryChain;
  address: string;
  label: string | null;
  balance: string;
  symbol: string;
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
    private readonly dataSource: DataSource,
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
    const repo = this.dataSource.getRepository(TreasuryMainWallet);
    const wallets = await repo.find({
      where: { chain },
      order: { is_default: 'DESC', created_at: 'ASC' },
    });

    if (wallets.length > 0) {
      return Promise.all(wallets.map((w) => this.toDto(w)));
    }

    return this.getSyntheticFromPaymentConfig(chain);
  }

  async listPendingApproval(): Promise<MainWalletDto[]> {
    const repo = this.dataSource.getRepository(TreasuryMainWallet);
    const wallets = await repo.find({
      where: { status: 'PENDING_APPROVAL' },
      order: { created_at: 'ASC' },
    });
    return Promise.all(wallets.map((w) => this.toDto(w)));
  }

  async getById(mainWalletId: string): Promise<TreasuryMainWallet> {
    const repo = this.dataSource.getRepository(TreasuryMainWallet);
    const wallet = await repo.findOne({ where: { main_wallet_id: mainWalletId } });
    if (!wallet) {
      throw new NotFoundException('Treasury main wallet', mainWalletId);
    }
    return wallet;
  }

  decryptPrivateKey(wallet: TreasuryMainWallet): string {
    return this.walletEncryptionService.decrypt(wallet.encrypted_private_key);
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

    const repo = this.dataSource.getRepository(TreasuryMainWallet);
    const defaultWallet = await repo.findOne({
      where: { chain, is_default: true, status: 'ACTIVE' },
    });
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
    const repo = this.dataSource.getRepository(TreasuryMainWallet);
    const wallet = await repo.findOne({
      where: { chain, is_default: true, status: 'ACTIVE' },
    });

    if (!wallet) {
      throw new BusinessException(
        `No active default main wallet configured for chain ${chain}. `
        + `Import via POST /treasury/main-wallets and approve via PATCH /treasury/main-wallets/:id/approve.`,
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
   * Status = PENDING_APPROVAL (requires Risk Officer approval before use).
   */
  async importMainWallet(
    dto: ImportMainWalletDto,
    createdByUserId: string,
  ): Promise<MainWalletDto> {
    const chain = this.assertSupportedChain(dto.chain);
    const address = this.deriveAddress(chain, dto.privateKey.trim());
    const encrypted = this.walletEncryptionService.encrypt(dto.privateKey.trim());

    const repo = this.dataSource.getRepository(TreasuryMainWallet);

    // Check for duplicate address on this chain
    const existing = await repo.findOne({ where: { chain, address } });
    if (existing) {
      throw new ConflictException(
        `A main wallet with address ${address} already exists for chain ${chain}`,
        'TREASURY_MAIN_WALLET_DUPLICATE',
      );
    }

    const created = await repo.save({
      main_wallet_id: uuidv7(),
      chain,
      address,
      encrypted_private_key: encrypted,
      label: dto.label?.trim() ?? null,
      is_default: false,
      status: 'PENDING_APPROVAL' as TreasuryMainWalletStatus,
      created_by: createdByUserId,
      approved_by: null,
      approved_at: null,
      rejected_by: null,
      rejected_at: null,
      last_rotated_at: null,
      rotation_interval_days: null,
    });

    this.logger.log(
      `Main wallet PENDING_APPROVAL: chain=${chain}, address=${address}, createdBy=${createdByUserId}`,
    );

    await this.publishEvent('main_wallet.pending_approval', {
      mainWalletId: created.main_wallet_id,
      chain,
      address,
      createdBy: createdByUserId,
    });

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
    const repo = this.dataSource.getRepository(TreasuryMainWallet);
    const wallet = await this.getById(mainWalletId);

    if (wallet.status !== 'PENDING_APPROVAL') {
      throw new BadRequestException(
        `Wallet ${mainWalletId} is not in PENDING_APPROVAL status (current: ${wallet.status})`,
        'TREASURY_MAIN_WALLET_NOT_PENDING',
      );
    }

    // Auto-set default if no active default exists for this chain
    const hasActiveDefault = await repo.findOne({
      where: { chain: wallet.chain, is_default: true, status: 'ACTIVE' },
    });

    wallet.status = 'ACTIVE';
    wallet.approved_by = approverUserId;
    wallet.approved_at = new Date();
    if (!hasActiveDefault) {
      wallet.is_default = true;
      this.logger.log(`Auto-set as default for chain ${wallet.chain}: ${wallet.main_wallet_id}`);
    }

    const updated = await repo.save(wallet);

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
    const repo = this.dataSource.getRepository(TreasuryMainWallet);
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

    const updated = await repo.save(wallet);

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
    const repo = this.dataSource.getRepository(TreasuryMainWallet);
    const wallet = await this.getById(mainWalletId);

    if (wallet.status !== 'ACTIVE') {
      throw new BadRequestException(
        `Only ACTIVE wallets can be set as default (current: ${wallet.status})`,
        'TREASURY_MAIN_WALLET_NOT_ACTIVE',
      );
    }

    // Use transaction: clear existing default → set new one
    await this.dataSource.transaction(async (manager) => {
      await manager.update(TreasuryMainWallet, { chain: wallet.chain, is_default: true }, { is_default: false });
      await manager.update(TreasuryMainWallet, { main_wallet_id: mainWalletId }, { is_default: true });
    });

    const updated = await repo.findOne({ where: { main_wallet_id: mainWalletId } });

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
   * Delete a main wallet. Cannot delete the active default if others exist for the same chain.
   */
  async removeMainWallet(mainWalletId: string, actorUserId: string): Promise<void> {
    const repo = this.dataSource.getRepository(TreasuryMainWallet);
    const wallet = await this.getById(mainWalletId);

    if (wallet.is_default) {
      const othersCount = await repo.count({
        where: { chain: wallet.chain, main_wallet_id: Not(mainWalletId), status: 'ACTIVE' },
      });
      if (othersCount > 0) {
        throw new ForbiddenException(
          'Cannot delete the current default main wallet while other active wallets exist for this chain. Set another as default first.',
        );
      }
    }

    await repo.delete({ main_wallet_id: mainWalletId });

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
    await this.dataSource.getRepository(TreasuryMainWallet).update(
      { main_wallet_id: mainWalletId },
      { last_rotated_at: new Date() },
    );
  }

  /**
   * Get all ACTIVE default wallets that are due for rotation based on their
   * `rotation_interval_days` (or the globalIntervalDays fallback).
   */
  async getWalletsDueForRotation(globalIntervalDays: number): Promise<TreasuryMainWallet[]> {
    const repo = this.dataSource.getRepository(TreasuryMainWallet);
    const allDefaults = await repo.find({
      where: { is_default: true, status: 'ACTIVE' },
    });

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
    try {
      const result = await this.transactionWalletService.getBalanceCached(w.chain as any, w.address);
      balance = result.balance;
      symbol = result.symbol;
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
      try {
        const r = await this.transactionWalletService.getBalanceCached(chain as any, address);
        balance = r.balance;
        symbol = r.symbol;
      } catch { /* best-effort */ }
      return [{
        mainWalletId: 'payment-config-default',
        chain,
        address,
        label: null,
        balance,
        symbol,
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
    const repo = this.dataSource.getRepository(TreasuryMainWallet);
    const count = await repo.count();
    if (count > 0) return;

    const chains: SupportedTreasuryChain[] = [
      'ETH_SEPOLIA', 'ETH_MAINNET',
      'TRON_NILE', 'TRON_SHASTA', 'TRON_MAINNET',
    ];

    for (const chain of chains) {
      try {
        const config = await this.getPaymentConfigForChain(chain);
        if (!config?.hotWalletPrivateKey) continue;

        const address = this.deriveAddress(chain, config.hotWalletPrivateKey);
        const encrypted = this.walletEncryptionService.encrypt(config.hotWalletPrivateKey);

        await repo.save({
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
      ETH_SEPOLIA: ['ETH', 'SEPOLIA'],
      ETH_MAINNET: ['ETH', 'MAINNET'],
      TRON_NILE: ['TRON', 'NILE'],
      TRON_SHASTA: ['TRON', 'SHASTA'],
      TRON_MAINNET: ['TRON', 'MAINNET'],
    };
    const entry = mapping[chain];
    if (!entry) return null;
    const [type, network] = entry;
    return this.paymentConfigService.getActiveConfig(
      type as 'ETH' | 'TRON',
      network,
    ) as Promise<BlockchainGatewayConfig | null>;
  }

  /**
   * Derive blockchain address from private key — supports ETH, TRON, Solana.
   */
  private deriveAddress(chain: SupportedTreasuryChain, privateKey: string): string {
    if (chain === 'ETH_SEPOLIA' || chain === 'ETH_MAINNET') {
      return new ethers.Wallet(privateKey).address;
    }
    if (chain === 'SOLANA_DEVNET' || chain === 'SOLANA_MAINNET') {
      const decoded = bs58.decode(privateKey);
      const keypair = Keypair.fromSecretKey(decoded);
      return keypair.publicKey.toBase58();
    }
    // TRON
    const addr = TronWeb.address.fromPrivateKey(privateKey);
    if (!addr) throw new Error(`Invalid TRON private key for chain ${chain}`);
    return addr;
  }

  private assertSupportedChain(chain: string): SupportedTreasuryChain {
    const supported: SupportedTreasuryChain[] = [
      'ETH_SEPOLIA', 'ETH_MAINNET',
      'TRON_NILE', 'TRON_SHASTA', 'TRON_MAINNET',
      'SOLANA_DEVNET', 'SOLANA_MAINNET',
    ];
    if (!supported.includes(chain as SupportedTreasuryChain)) {
      throw new BadRequestException(
        `Unsupported chain: ${chain}. Supported: ${supported.join(', ')}`,
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
