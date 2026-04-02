import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import Decimal from 'decimal.js';
import { uuidv7 } from 'uuidv7';
import { TronWeb } from 'tronweb';
import { WalletEncryptionService } from '@/common/services';
import {
  BadRequestException,
  BusinessException,
  ForbiddenException,
  NotFoundException,
} from '@/common/exceptions';
import { BlockchainNetwork, UserRole } from '@/common/enums';
import { TransactionWallet } from '@/entities/transaction-wallet.entity';
import { AppSetting } from '@/entities/app-setting.entity';
import { OnchainTransaction } from '@/entities/onchain-transaction.entity';
import { CurrencyNetwork } from '@/entities/currency-network.entity';
import { TreasuryMainWallet } from '@/entities/treasury-main-wallet.entity';
import {
  CreateManagedWalletDto,
  ManagedWalletResponseDto,
  SendManagedTransactionDto,
  UpdateRecommendedChainDto,
} from './dto';
import { TransactionWalletService } from '@/modules/treasury/transaction-wallet.service';
import { SystemConfigService } from '@/modules/system-config/system-config.service';

type SupportedManagedWalletChain = 'TRON_NILE' | 'TRON_SHASTA';

export type ConfiguredDepositWalletResolution = {
  address: string;
  chain: SupportedManagedWalletChain;
  source: 'transaction_wallet';
};

type DepositMethodItem = {
  chain: SupportedManagedWalletChain;
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
    BlockchainNetwork.TRON_NILE,
    BlockchainNetwork.TRON_SHASTA,
  ];

  constructor(
    private readonly dataSource: DataSource,
    private readonly walletEncryptionService: WalletEncryptionService,
    private readonly transactionWalletService: TransactionWalletService,
    private readonly systemConfigService: SystemConfigService,
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

    return this.dataSource
      .getRepository(OnchainTransaction)
      .createQueryBuilder('tx')
      .where('tx.chain = :chain', { chain })
      .andWhere('(tx.from_address = :address OR tx.to_address = :address)', {
        address,
      })
      .orderBy('tx.created_at', 'DESC')
      .limit(Math.max(1, Math.min(limit, 200)))
      .getMany();
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

    if (w.chain !== BlockchainNetwork.TRON_NILE && w.chain !== BlockchainNetwork.TRON_SHASTA) {
      throw new BadRequestException(
        'Only Tron Nile/Shasta transaction wallets support this send endpoint',
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
    await this.dataSource.getRepository(OnchainTransaction).save({
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
    const updated = await this.dataSource.getRepository(TransactionWallet).findOne({
      where: { wallet_id: walletId },
    });
    if (!updated) {
      throw new NotFoundException('Transaction wallet', walletId);
    }
    return this.mapTransactionWallet(updated);
  }

  async setRecommendedChain(
    dto: UpdateRecommendedChainDto,
  ): Promise<{ recommended_chain: SupportedManagedWalletChain }> {
    const chain = this.assertSupportedChain(dto.chain);
    await this.dataSource.getRepository(AppSetting).save({
      k: ManagedWalletsService.RECOMMENDED_CHAIN_KEY,
      v: chain,
    });

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
  async getConfiguredDepositWallet(chain: string): Promise<ConfiguredDepositWalletResolution | null> {
    if (
      chain !== BlockchainNetwork.TRON_NILE &&
      chain !== BlockchainNetwork.TRON_SHASTA
    ) {
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
    recommended_chain: SupportedManagedWalletChain;
    methods: DepositMethodItem[];
  }> {
    const recommendedChain = await this.getRecommendedChain();
    const networkRows = await this.dataSource
      .getRepository(CurrencyNetwork)
      .createQueryBuilder('network')
      .select('network.network_code', 'network_code')
      .addSelect('MAX(CASE WHEN network.deposit_enabled THEN 1 ELSE 0 END)', 'deposit_enabled')
      .addSelect('MAX(network.min_confirmations)', 'min_confirmations')
      .where('network.network_code IN (:...codes)', {
        codes: ManagedWalletsService.SUPPORTED_CHAINS,
      })
      .groupBy('network.network_code')
      .getRawMany<{
        network_code: SupportedManagedWalletChain;
        deposit_enabled: number | string;
        min_confirmations: number | string;
      }>();

    const networkMap = new Map(
      networkRows.map((row) => [
        row.network_code,
        {
          deposit_enabled: Number(row.deposit_enabled) === 1,
          min_confirmations: Number(row.min_confirmations) || 12,
        },
      ]),
    );

    const methods = await Promise.all(
      ManagedWalletsService.SUPPORTED_CHAINS.map(async (chain) => {
        const configuredWallet = await this.getConfiguredDepositWallet(chain);
        const fallbackHotWallet = await this.getFallbackHotWalletAddress(chain);
        const networkConfig = networkMap.get(chain);
        return {
          chain,
          label:
            chain === BlockchainNetwork.TRON_NILE
              ? 'Tron Network (Nile Testnet)'
              : 'Tron Network (Shasta Testnet)',
          deposit_address: configuredWallet?.address ?? fallbackHotWallet ?? '',
          is_recommended: chain === recommendedChain,
          deposit_enabled: networkConfig?.deposit_enabled ?? true,
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
    const setting = await this.dataSource.getRepository(AppSetting).findOne({
      where: { k: ManagedWalletsService.RECOMMENDED_CHAIN_KEY },
    });

    return this.assertSupportedChain(setting?.v ?? BlockchainNetwork.TRON_NILE);
  }

  private async requireTransactionWalletForActor(
    _userId: string,
    walletId: string,
    role: UserRole,
  ): Promise<TransactionWallet> {
    if (role !== UserRole.ADMIN && role !== UserRole.RISK_OFFICER) {
      throw new ForbiddenException('Not allowed to access transaction wallets');
    }
    const wallet = await this.dataSource.getRepository(TransactionWallet).findOne({
      where: { wallet_id: walletId },
    });
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

  private async buildTronWeb(
    chain: SupportedManagedWalletChain,
    privateKey?: string,
  ): Promise<TronWeb> {
    const fullHost =
      chain === BlockchainNetwork.TRON_SHASTA
        ? await this.systemConfigService.getEffectiveString('TRON_SHASTA_FULL_HOST')
        : await this.systemConfigService.getEffectiveString('TRON_NILE_FULL_HOST');

    return new TronWeb({
      fullHost,
      privateKey: privateKey || undefined,
    });
  }

  /**
   * Fallback deposit address: reads the default ACTIVE main wallet for the given TRON chain.
   * Used when no transaction wallet is configured yet.
   * No .env read — treasury_main_wallets is the single source of truth.
   */
  private async getFallbackHotWalletAddress(
    chain: SupportedManagedWalletChain,
  ): Promise<string | null> {
    try {
      const repo = this.dataSource.getRepository(TreasuryMainWallet);
      const wallet = await repo.findOne({
        where: { chain, is_default: true, status: 'ACTIVE' } as any,
        select: ['address'],
      });
      return wallet?.address ?? null;
    } catch {
      return null;
    }
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
    if (
      chain !== BlockchainNetwork.TRON_NILE &&
      chain !== BlockchainNetwork.TRON_SHASTA
    ) {
      throw new BadRequestException(
        `Unsupported managed wallet chain: ${chain}`,
        'UNSUPPORTED_MANAGED_WALLET_CHAIN',
      );
    }

    return chain;
  }
}
