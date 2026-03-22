import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import Decimal from 'decimal.js';
import { uuidv7 } from 'uuidv7';
import { TronWeb } from 'tronweb';
import { WalletEncryptionService } from '@/common/services';
import {
  BadRequestException,
  BusinessException,
  ConflictException,
  NotFoundException,
} from '@/common/exceptions';
import { BlockchainNetwork, UserRole } from '@/common/enums';
import { ManagedWallet } from '@/entities/managed-wallet.entity';
import { AppSetting } from '@/entities/app-setting.entity';
import { OnchainTransaction } from '@/entities/onchain-transaction.entity';
import { CurrencyNetwork } from '@/entities/currency-network.entity';
import {
  CreateManagedWalletDto,
  ManagedWalletResponseDto,
  SendManagedTransactionDto,
  UpdateRecommendedChainDto,
} from './dto';

type SupportedManagedWalletChain = 'TRON_NILE' | 'TRON_SHASTA';

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
    private readonly configService: ConfigService,
    private readonly walletEncryptionService: WalletEncryptionService,
  ) {}

  async createWallet(
    userId: string,
    dto: CreateManagedWalletDto,
  ): Promise<ManagedWalletResponseDto> {
    const chain = this.assertSupportedChain(dto.chain);
    const account = await TronWeb.createAccount();
    const walletRepo = this.dataSource.getRepository(ManagedWallet);

    const created = walletRepo.create({
      wallet_id: uuidv7(),
      user_id: userId,
      chain,
      address: account.address.base58,
      public_key: account.publicKey,
      encrypted_private_key: this.walletEncryptionService.encrypt(account.privateKey),
      encrypted_seed_phrase: null,
      label: dto.label?.trim() || null,
      is_default_deposit: false,
      default_set_at: null,
      is_active: true,
    });

    try {
      await walletRepo.save(created);
    } catch (error: any) {
      if (String(error?.message ?? '').includes('uk_managed_wallet_user_chain_addr')) {
        throw new ConflictException('Wallet already exists on this chain', 'MANAGED_WALLET_EXISTS');
      }
      throw error;
    }

    return this.mapWallet(created);
  }

  async listWallets(userId: string, role: UserRole): Promise<ManagedWalletResponseDto[]> {
    const repo = this.dataSource.getRepository(ManagedWallet);
    const order = {
      is_default_deposit: 'DESC' as const,
      created_at: 'DESC' as const,
    };
    const wallets =
      role === UserRole.ADMIN
        ? await repo.find({ order })
        : await repo.find({
            where: { user_id: userId },
            order,
          });

    return wallets.map((wallet) => this.mapWallet(wallet));
  }

  async getDepositDefaults(): Promise<{
    recommended_chain: SupportedManagedWalletChain;
    defaults: ManagedWalletResponseDto[];
  }> {
    const recommendedChain = await this.getRecommendedChain();
    const wallets = await this.dataSource.getRepository(ManagedWallet).find({
      where: { is_default_deposit: true, is_active: true },
      order: { created_at: 'DESC' },
    });

    return {
      recommended_chain: recommendedChain,
      defaults: wallets.map((wallet) => this.mapWallet(wallet)),
    };
  }

  async getWalletDetail(
    userId: string,
    walletId: string,
    role: UserRole,
  ): Promise<ManagedWalletResponseDto & { balance: string; symbol: string }> {
    const wallet = await this.requireWalletForActor(userId, walletId, role);
    const tronWeb = this.buildTronWeb(wallet.chain);
    const sunBalance = await tronWeb.trx.getBalance(wallet.address);

    return {
      ...this.mapWallet(wallet),
      balance: new Decimal(sunBalance).div(1_000_000).toString(),
      symbol: 'TRX',
    };
  }

  async getWalletTransactions(
    userId: string,
    walletId: string,
    role: UserRole,
    limit: number = 50,
  ): Promise<OnchainTransaction[]> {
    const wallet = await this.requireWalletForActor(userId, walletId, role);
    return this.dataSource
      .getRepository(OnchainTransaction)
      .createQueryBuilder('tx')
      .where('tx.chain = :chain', { chain: wallet.chain })
      .andWhere('(tx.from_address = :address OR tx.to_address = :address)', {
        address: wallet.address,
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
    const wallet = await this.requireWalletForActor(userId, walletId, role);
    const chain = this.assertSupportedChain(wallet.chain);
    const amount = this.normalizePositiveAmount(dto.amount);
    const tronWeb = this.buildTronWeb(
      chain,
      this.walletEncryptionService.decrypt(wallet.encrypted_private_key),
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
      user_id: wallet.user_id,
      linked_wallet_id: null,
      chain,
      type: 'TRANSFER',
      tx_hash: tx.txid,
      from_address: wallet.address,
      to_address: dto.to_address,
      amount,
      confirmations: 0,
      status: 'PENDING',
      confirmed_at: null,
    });

    this.logger.log(
      `Managed wallet transfer submitted: wallet=${walletId}, txHash=${tx.txid}, amount=${amount}`,
    );

    return {
      txId,
      txHash: tx.txid,
      chain,
      fromAddress: wallet.address,
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
    const walletResolved = await this.requireWalletForActor(userId, walletId, role);
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(ManagedWallet);
      const wallet = await repo.findOne({
        where: {
          wallet_id: walletResolved.wallet_id,
        },
      });

      if (!wallet) {
        throw new NotFoundException('Managed wallet', walletId);
      }
      if (!wallet.is_active) {
        throw new BadRequestException('Inactive wallet cannot be default', 'WALLET_INACTIVE');
      }

      await repo.update(
        {
          chain: wallet.chain,
          is_default_deposit: true,
        },
        {
          is_default_deposit: false,
          default_set_at: null,
        },
      );

      wallet.is_default_deposit = true;
      wallet.default_set_at = new Date();
      await repo.save(wallet);

      return this.mapWallet(wallet);
    });
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
    const wallet = await this.requireWalletForActor(userId, walletId, role);
    if (wallet.is_default_deposit) {
      throw new BadRequestException(
        'Cannot deactivate the current default deposit wallet',
        'DEFAULT_WALLET_DEACTIVATE_FORBIDDEN',
      );
    }

    wallet.is_active = false;
    await this.dataSource.getRepository(ManagedWallet).save(wallet);
    return { success: true };
  }

  /**
   * Returns configured managed wallet for Tron chains, or null for ETH/Solana
   * (those use hot wallet from blockchain provider).
   */
  async getConfiguredDepositWallet(chain: string): Promise<ManagedWallet | null> {
    if (
      chain !== BlockchainNetwork.TRON_NILE &&
      chain !== BlockchainNetwork.TRON_SHASTA
    ) {
      return null;
    }
    return this.dataSource.getRepository(ManagedWallet).findOne({
      where: {
        chain: chain as SupportedManagedWalletChain,
        is_default_deposit: true,
        is_active: true,
      },
      order: {
        default_set_at: 'DESC',
        created_at: 'DESC',
      },
    });
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
        const fallbackHotWallet = this.getFallbackHotWalletAddress(chain);
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

  private async requireWalletForActor(
    userId: string,
    walletId: string,
    role: UserRole,
  ): Promise<ManagedWallet> {
    const where =
      role === UserRole.ADMIN
        ? { wallet_id: walletId }
        : {
            wallet_id: walletId,
            user_id: userId,
          };
    const wallet = await this.dataSource.getRepository(ManagedWallet).findOne({
      where,
    });

    if (!wallet) {
      throw new NotFoundException('Managed wallet', walletId);
    }

    return wallet;
  }

  private mapWallet(wallet: ManagedWallet): ManagedWalletResponseDto {
    return {
      walletId: wallet.wallet_id,
      userId: wallet.user_id,
      chain: wallet.chain,
      address: wallet.address,
      publicKey: wallet.public_key,
      label: wallet.label,
      isDefaultDeposit: wallet.is_default_deposit,
      isActive: wallet.is_active,
      defaultSetAt: wallet.default_set_at ? wallet.default_set_at.toISOString() : null,
      createdAt: wallet.created_at.toISOString(),
      updatedAt: wallet.updated_at.toISOString(),
    };
  }

  private buildTronWeb(
    chain: SupportedManagedWalletChain,
    privateKey?: string,
  ): TronWeb {
    const fullHost =
      chain === BlockchainNetwork.TRON_SHASTA
        ? this.configService.get<string>('app.blockchain.tron.shastaFullHost') ??
          'https://api.shasta.trongrid.io'
        : this.configService.get<string>('app.blockchain.tron.nileFullHost') ??
          'https://nile.trongrid.io';

    return new TronWeb({
      fullHost,
      privateKey: privateKey || undefined,
    });
  }

  private getFallbackHotWalletAddress(chain: SupportedManagedWalletChain): string | null {
    const privateKey = this.configService.get<string>('TRON_HOT_WALLET_PRIVATE_KEY')?.trim();
    if (!privateKey) {
      return null;
    }

    return this.buildTronWeb(chain, privateKey).defaultAddress.base58 || null;
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
