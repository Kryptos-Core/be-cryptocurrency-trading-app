import { Injectable, Logger } from '@nestjs/common';
import Decimal from 'decimal.js';
import { TronWeb } from 'tronweb';
import { uuidv7 } from 'uuidv7';
import {
  BLOCKCHAIN_CHAIN_DB_VALUES,
  type BlockchainChainDbValue,
} from '@/common/constants/blockchain-chain-db';
import { BlockchainNetwork, UserRole } from '@/common/enums';
import {
  BadRequestException,
  BusinessException,
  ForbiddenException,
  NotFoundException,
} from '@/common/exceptions';
import type { WalletEncryptionService } from '@/common/services';
import type { OnchainTransaction } from '@/entities/onchain-transaction.entity';
import type { TransactionWallet } from '@/entities/transaction-wallet.entity';
import type { SystemConfigService } from '@/modules/system-config/system-config.service';
import type { OnchainChainPickerService } from '@/modules/treasury/onchain-chain-picker.service';
import { resolveRecommendedChainForDepositPicker } from '@/modules/treasury/onchain-chain-picker.util';
import type {
  TreasuryTransactionWalletRepository,
  TronDepositUiChain,
} from '@/modules/treasury/repositories/treasury-transaction-wallet.repository';
import type { TransactionWalletService } from '@/modules/treasury/transaction-wallet.service';
import type { TreasuryMainWalletService } from '@/modules/treasury/treasury-main-wallet.service';
import type {
  CreateManagedWalletDto,
  ManagedWalletResponseDto,
  SendManagedTransactionDto,
  UpdateRecommendedChainDto,
} from './dto';
import type { ManagedWalletsDataRepository } from './repositories/managed-wallets-data.repository';

const MANAGED_TRON_CHAINS = [
  BlockchainNetwork.TRON_MAINNET,
  BlockchainNetwork.TRON_NILE,
  BlockchainNetwork.TRON_SHASTA,
] as const;

type SupportedManagedWalletChain = (typeof MANAGED_TRON_CHAINS)[number];

export type ConfiguredDepositWalletResolution = {
  address: string;
  chain: SupportedManagedWalletChain;
  source: 'transaction_wallet';
};

type DepositMethodItem = {
  /** API chain code — same universe as GET /treasury/chain-picker-options `onchain_deposit_withdraw`. */
  chain: string;
  label: string;
  deposit_address: string;
  is_recommended: boolean;
  deposit_enabled: boolean;
  min_confirmations: number;
  estimated_time: string;
};

@Injectable()
export class ManagedWalletsService {
  private readonly logger = new Logger(ManagedWalletsService.name);
  private static readonly RECOMMENDED_CHAIN_KEY = 'deposit.recommended_chain';
  private static readonly SUPPORTED_CHAINS: SupportedManagedWalletChain[] = [
    ...MANAGED_TRON_CHAINS,
  ];

  constructor(
    private readonly managedWalletsDataRepository: ManagedWalletsDataRepository,
    private readonly treasuryTransactionWalletRepository: TreasuryTransactionWalletRepository,
    private readonly walletEncryptionService: WalletEncryptionService,
    private readonly transactionWalletService: TransactionWalletService,
    private readonly systemConfigService: SystemConfigService,
    private readonly onchainChainPickerService: OnchainChainPickerService,
    private readonly treasuryMainWalletService: TreasuryMainWalletService,
  ) {}

  async createWallet(
    _userId: string,
    _dto: CreateManagedWalletDto,
  ): Promise<ManagedWalletResponseDto> {
    throw new ForbiddenException(
      'Managed wallet creation is disabled. Create a transaction wallet via POST /treasury/wallets (purpose DEPOSIT or BOTH).',
    );
  }

  async listWallets(_userId: string, _role: UserRole): Promise<ManagedWalletResponseDto[]> {
    const wallets = await this.transactionWalletService.listWalletsForDepositConfiguration();
    return wallets.map((wallet) => this.mapTransactionWallet(wallet));
  }

  async getDepositDefaults(): Promise<{
    recommended_chain: SupportedManagedWalletChain;
    defaults: ManagedWalletResponseDto[];
  }> {
    const recommendedChain = await this.getRecommendedChain();
    const defaults: ManagedWalletResponseDto[] = [];

    for (const chain of ManagedWalletsService.SUPPORTED_CHAINS) {
      const tw = await this.transactionWalletService.getDefaultUserDepositWallet(chain);
      if (tw) {
        defaults.push(this.mapTransactionWallet(tw));
      }
    }

    return {
      recommended_chain: recommendedChain,
      defaults,
    };
  }

  async getWalletDetail(
    userId: string,
    walletId: string,
    role: UserRole,
  ): Promise<ManagedWalletResponseDto & { balance: string; symbol: string }> {
    await this.requireTransactionWalletForActor(userId, walletId, role);
    const detail = await this.transactionWalletService.getWalletDetail(walletId);
    return {
      ...this.mapTransactionWallet(detail),
      balance: detail.balance,
      symbol: detail.symbol,
    };
  }

  async getWalletTransactions(
    userId: string,
    walletId: string,
    role: UserRole,
    limit: number = 50,
  ): Promise<OnchainTransaction[]> {
    const wallet = await this.requireTransactionWalletForActor(userId, walletId, role);
    const { chain, address } = wallet;

    return this.managedWalletsDataRepository.listOnchainTransactionsForAddress(
      chain,
      address,
      Math.max(1, Math.min(limit, 200)),
    );
  }

  async sendTransaction(
    userId: string,
    walletId: string,
    role: UserRole,
    dto: SendManagedTransactionDto,
  ): Promise<{
    txId: string;
    txHash: string;
    chain: SupportedManagedWalletChain;
    fromAddress: string;
    toAddress: string;
    amount: string;
    memo?: string;
  }> {
    const w = await this.requireTransactionWalletForActor(userId, walletId, role);
    const amount = this.normalizePositiveAmount(dto.amount);

    if (!(MANAGED_TRON_CHAINS as readonly string[]).includes(w.chain)) {
      throw new BadRequestException(
        'Only Tron family transaction wallets support this send endpoint',
        'UNSUPPORTED_SEND_CHAIN',
      );
    }
    const chain = this.assertSupportedChain(w.chain);
    const tronWeb = await this.buildTronWeb(
      chain,
      this.walletEncryptionService.decrypt(w.encrypted_private_key),
    );

    if (!tronWeb.isAddress(dto.to_address)) {
      throw new BadRequestException('Invalid Tron destination address', 'INVALID_TRON_ADDRESS');
    }

    const tx = await tronWeb.trx.sendTransaction(
      dto.to_address,
      Math.floor(Number(new Decimal(amount).mul(1_000_000).toString())),
    );

    if (!tx?.result || !tx?.txid) {
      throw new BusinessException('Failed to submit Tron transaction', 'TRON_SEND_FAILED');
    }

    const txId = uuidv7();
    await this.managedWalletsDataRepository.saveOnchainTransaction({
      tx_id: txId,
      user_id: userId,
      linked_wallet_id: null,
      chain,
      type: 'TRANSFER',
      tx_hash: tx.txid,
      from_address: w.address,
      to_address: dto.to_address,
      amount,
      confirmations: 0,
      status: 'PENDING',
      confirmed_at: null,
    });

    this.logger.log(
      `Transaction wallet transfer submitted: wallet=${walletId}, txHash=${tx.txid}, amount=${amount}`,
    );

    return {
      txId,
      txHash: tx.txid,
      chain,
      fromAddress: w.address,
      toAddress: dto.to_address,
      amount,
      memo: dto.memo,
    };
  }

  async setDepositDefault(
    userId: string,
    walletId: string,
    role: UserRole,
  ): Promise<ManagedWalletResponseDto> {
    await this.requireTransactionWalletForActor(userId, walletId, role);
    await this.transactionWalletService.setDefaultUserDeposit(walletId);
    const updated = await this.treasuryTransactionWalletRepository.findByWalletId(walletId);
    if (!updated) {
      throw new NotFoundException('Transaction wallet', walletId);
    }
    return this.mapTransactionWallet(updated);
  }

  async clearDepositDefault(
    userId: string,
    walletId: string,
    role: UserRole,
  ): Promise<ManagedWalletResponseDto> {
    await this.requireTransactionWalletForActor(userId, walletId, role);
    const updated = await this.transactionWalletService.unsetDefaultUserDeposit(walletId);
    return this.mapTransactionWallet(updated);
  }

  async setRecommendedChain(
    dto: UpdateRecommendedChainDto,
  ): Promise<{ recommended_chain: SupportedManagedWalletChain }> {
    const chain = this.assertSupportedChain(dto.chain);
    await this.managedWalletsDataRepository.upsertAppSettingKeyValue(
      ManagedWalletsService.RECOMMENDED_CHAIN_KEY,
      chain,
    );

    return { recommended_chain: chain };
  }

  async deactivateWallet(
    userId: string,
    walletId: string,
    role: UserRole,
  ): Promise<{ success: true }> {
    await this.requireTransactionWalletForActor(userId, walletId, role);
    await this.transactionWalletService.deactivateWallet(walletId);
    return { success: true };
  }

  /** User-visible Tron deposit address from transaction_wallets only. */
  async getConfiguredDepositWallet(
    chain: string,
  ): Promise<ConfiguredDepositWalletResolution | null> {
    if (chain !== BlockchainNetwork.TRON_MAINNET) {
      return null;
    }
    const supportedChain = chain as SupportedManagedWalletChain;
    const tw = await this.transactionWalletService.getDefaultUserDepositWallet(supportedChain);
    if (!tw) {
      return null;
    }
    return {
      address: tw.address,
      chain: supportedChain,
      source: 'transaction_wallet',
    };
  }

  async getDepositMethods(): Promise<{
    /** Effective recommended row for public deposit UI — always a chain from `onchain_deposit_withdraw`. */
    recommended_chain: string;
    methods: DepositMethodItem[];
  }> {
    const pickerDto = this.onchainChainPickerService.getChainPickerOptions();
    const pickerList = pickerDto.pickers.onchain_deposit_withdraw ?? [];
    const fromPicker = pickerList.filter((c): c is BlockchainChainDbValue =>
      (BLOCKCHAIN_CHAIN_DB_VALUES as readonly string[]).includes(c),
    );
    const chains: string[] =
      fromPicker.length > 0 ? fromPicker : [...ManagedWalletsService.SUPPORTED_CHAINS];

    const settingRecommended = await this.getRecommendedChain();
    const recommendedChain = resolveRecommendedChainForDepositPicker(
      settingRecommended,
      chains,
      pickerDto.tronDefaultNetwork,
    );

    const networkMap =
      await this.managedWalletsDataRepository.aggregateDepositFlagsByNetworkCodes(chains);

    const methods = await Promise.all(
      chains.map(async (chain) => {
        const address = await this.resolveDepositMethodDisplayAddress(chain);
        const networkConfig = networkMap.get(chain);
        const hasDefault = address.length > 0;
        return {
          chain,
          label: ManagedWalletsService.depositLabelForChain(chain),
          deposit_address: address,
          is_recommended: chain === recommendedChain,
          deposit_enabled: (networkConfig?.deposit_enabled ?? true) && hasDefault,
          min_confirmations: networkConfig?.min_confirmations ?? 12,
          estimated_time: '~3 minutes',
        } satisfies DepositMethodItem;
      }),
    );

    return {
      recommended_chain: recommendedChain,
      methods: methods.sort((a, b) => Number(b.is_recommended) - Number(a.is_recommended)),
    };
  }

  async getRecommendedChain(): Promise<SupportedManagedWalletChain> {
    const v = await this.managedWalletsDataRepository.findAppSettingValueByKey(
      ManagedWalletsService.RECOMMENDED_CHAIN_KEY,
    );

    return this.assertSupportedChain(v ?? BlockchainNetwork.TRON_MAINNET);
  }

  private async requireTransactionWalletForActor(
    _userId: string,
    walletId: string,
    role: UserRole,
  ): Promise<TransactionWallet> {
    if (
      role !== UserRole.ADMIN &&
      role !== UserRole.RISK_OFFICER &&
      role !== UserRole.FINANCE_MANAGER
    ) {
      throw new ForbiddenException('Not allowed to access transaction wallets');
    }
    const wallet = await this.treasuryTransactionWalletRepository.findByWalletId(walletId);
    if (!wallet) {
      throw new NotFoundException('Transaction wallet', walletId);
    }
    return wallet;
  }

  private mapTransactionWallet(wallet: TransactionWallet): ManagedWalletResponseDto {
    return {
      walletId: wallet.wallet_id,
      userId: '',
      chain: wallet.chain,
      address: wallet.address,
      publicKey: '',
      label: wallet.label,
      isDefaultDeposit: wallet.is_default_user_deposit,
      isActive: wallet.is_active,
      defaultSetAt: wallet.default_set_at ? wallet.default_set_at.toISOString() : null,
      createdAt: wallet.created_at.toISOString(),
      updatedAt: wallet.updated_at.toISOString(),
    };
  }

  /**
   * Tron mainnet: default user-deposit transaction wallet only (same as GET /blockchain/deposit/address).
   * Tron testnets: transaction default, else treasury main wallet.
   * EVM / Solana: treasury main wallet address when configured.
   */
  private async resolveDepositMethodDisplayAddress(chain: string): Promise<string> {
    const c = chain as BlockchainNetwork;
    if (c === BlockchainNetwork.TRON_MAINNET) {
      const tw = await this.transactionWalletService.getDefaultUserDepositWallet(
        BlockchainNetwork.TRON_MAINNET,
      );
      return tw?.address ?? '';
    }
    if (c === BlockchainNetwork.TRON_NILE || c === BlockchainNetwork.TRON_SHASTA) {
      const tw = await this.transactionWalletService.getDefaultUserDepositWallet(
        c as TronDepositUiChain,
      );
      if (tw?.address) {
        return tw.address;
      }
      return (
        (await this.treasuryMainWalletService.getDefaultActiveMainWalletAddressOrNull(chain)) ?? ''
      );
    }
    return (
      (await this.treasuryMainWalletService.getDefaultActiveMainWalletAddressOrNull(chain)) ?? ''
    );
  }

  private static depositLabelForChain(chain: string): string {
    switch (chain) {
      case BlockchainNetwork.TRON_NILE:
        return 'Tron Nile (TRC-20 testnet)';
      case BlockchainNetwork.TRON_SHASTA:
        return 'Tron Shasta (TRC-20 testnet)';
      case BlockchainNetwork.TRON_MAINNET:
        return 'Tron Network (TRC-20 Mainnet)';
      case BlockchainNetwork.ETH_MAINNET:
        return 'Ethereum (mainnet)';
      case BlockchainNetwork.BSC_CHAPEL:
        return 'BNB Smart Chain (Chapel testnet)';
      case BlockchainNetwork.BSC_MAINNET:
        return 'BNB Smart Chain (mainnet)';
      case BlockchainNetwork.SOLANA_DEVNET:
        return 'Solana (devnet)';
      case BlockchainNetwork.SOLANA_MAINNET:
        return 'Solana (mainnet)';
      default:
        return chain;
    }
  }

  private async buildTronWeb(
    chain: SupportedManagedWalletChain,
    privateKey?: string,
  ): Promise<TronWeb> {
    let fullHost: string;
    if (chain === BlockchainNetwork.TRON_NILE) {
      const v = await this.systemConfigService.get<string>('TRON_NILE_FULL_HOST');
      fullHost = v?.trim() || process.env.TRON_NILE_FULL_HOST?.trim() || 'https://nile.trongrid.io';
    } else if (chain === BlockchainNetwork.TRON_SHASTA) {
      const v = await this.systemConfigService.get<string>('TRON_SHASTA_FULL_HOST');
      fullHost =
        v?.trim() || process.env.TRON_SHASTA_FULL_HOST?.trim() || 'https://api.shasta.trongrid.io';
    } else {
      fullHost = await this.systemConfigService.getEffectiveString('TRON_MAINNET_FULL_HOST');
    }
    return new TronWeb({
      fullHost,
      privateKey: privateKey || undefined,
    });
  }

  private normalizePositiveAmount(rawAmount: string): string {
    let amount: Decimal;
    try {
      amount = new Decimal(rawAmount);
    } catch {
      throw new BadRequestException('Amount must be a valid decimal', 'INVALID_AMOUNT');
    }

    if (!amount.isFinite() || amount.lte(0)) {
      throw new BadRequestException('Amount must be greater than zero', 'INVALID_AMOUNT');
    }

    return amount.toString();
  }

  private assertSupportedChain(chain: string): SupportedManagedWalletChain {
    if (!(MANAGED_TRON_CHAINS as readonly string[]).includes(chain)) {
      throw new BadRequestException(
        `Unsupported managed wallet chain: ${chain}`,
        'UNSUPPORTED_MANAGED_WALLET_CHAIN',
      );
    }

    return chain as SupportedManagedWalletChain;
  }
}
