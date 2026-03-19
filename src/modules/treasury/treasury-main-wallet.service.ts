import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ethers } from 'ethers';
import { TronWeb } from 'tronweb';
import { uuidv7 } from 'uuidv7';
import { WalletEncryptionService } from '@/common/services';
import { PaymentConfigService } from '@/modules/payment-config/payment-config.service';
import { BlockchainGatewayConfig } from '@/modules/payment-config/interfaces/payment-gateway-config.interface';
import { TreasuryMainWallet } from '@/entities/treasury-main-wallet.entity';
import { TransactionWalletService } from './transaction-wallet.service';

export type SupportedTreasuryChain =
  | 'ETH_SEPOLIA'
  | 'ETH_MAINNET'
  | 'TRON_NILE'
  | 'TRON_SHASTA'
  | 'TRON_MAINNET';

export interface MainWalletDto {
  mainWalletId: string;
  address: string;
  label: string | null;
  balance: string;
  symbol: string;
  isDefault: boolean;
}

@Injectable()
export class TreasuryMainWalletService implements OnModuleInit {
  private readonly logger = new Logger(TreasuryMainWalletService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly walletEncryptionService: WalletEncryptionService,
    private readonly paymentConfigService: PaymentConfigService,
    private readonly transactionWalletService: TransactionWalletService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seedFromPaymentConfigIfEmpty();
  }

  async listByChain(chain: SupportedTreasuryChain): Promise<MainWalletDto[]> {
    const repo = this.dataSource.getRepository(TreasuryMainWallet);
    const wallets = await repo.find({
      where: { chain },
      order: { is_default: 'DESC', created_at: 'ASC' },
    });

    if (wallets.length > 0) {
      return Promise.all(
        wallets.map(async (w) => {
          const { balance, symbol } =
            await this.transactionWalletService.getBalanceCached(chain, w.address);
          return {
            mainWalletId: w.main_wallet_id,
            address: w.address,
            label: w.label,
            balance,
            symbol,
            isDefault: w.is_default,
          };
        }),
      );
    }

    return this.getSyntheticFromPaymentConfig(chain);
  }

  async getById(mainWalletId: string): Promise<TreasuryMainWallet> {
    const repo = this.dataSource.getRepository(TreasuryMainWallet);
    const wallet = await repo.findOne({ where: { main_wallet_id: mainWalletId } });
    if (!wallet) {
      throw new Error(`Treasury main wallet not found: ${mainWalletId}`);
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
      where: { chain, is_default: true },
    });
    if (defaultWallet) {
      return defaultWallet.address;
    }

    return this.transactionWalletService.getMainWalletAddress(chain);
  }

  private async getSyntheticFromPaymentConfig(
    chain: SupportedTreasuryChain,
  ): Promise<MainWalletDto[]> {
    try {
      const address =
        await this.transactionWalletService.getMainWalletAddress(chain);
      const { balance, symbol } =
        await this.transactionWalletService.getBalanceCached(chain, address);
      return [
        {
          mainWalletId: 'payment-config-default',
          address,
          label: null,
          balance,
          symbol,
          isDefault: true,
        },
      ];
    } catch {
      return [];
    }
  }

  private async seedFromPaymentConfigIfEmpty(): Promise<void> {
    const repo = this.dataSource.getRepository(TreasuryMainWallet);
    const count = await repo.count();
    if (count > 0) return;

    const chains: SupportedTreasuryChain[] = [
      'ETH_SEPOLIA',
      'ETH_MAINNET',
      'TRON_NILE',
      'TRON_SHASTA',
      'TRON_MAINNET',
    ];

    for (const chain of chains) {
      try {
        const config = await this.getPaymentConfigForChain(chain);
        if (!config?.hotWalletPrivateKey) continue;

        const address = this.deriveAddress(chain, config.hotWalletPrivateKey);
        const encrypted = this.walletEncryptionService.encrypt(
          config.hotWalletPrivateKey,
        );

        await repo.save({
          main_wallet_id: uuidv7(),
          chain,
          address,
          encrypted_private_key: encrypted,
          label: `${chain} (from Payment Config)`,
          is_default: true,
        });
        this.logger.log(`Seeded treasury main wallet for ${chain}`);
      } catch (err) {
        this.logger.warn(`Could not seed main wallet for ${chain}: ${(err as Error).message}`);
      }
    }
  }

  private async getPaymentConfigForChain(
    chain: SupportedTreasuryChain,
  ): Promise<BlockchainGatewayConfig | null> {
    const mapping: Record<SupportedTreasuryChain, [string, string]> = {
      ETH_SEPOLIA: ['ETH', 'SEPOLIA'],
      ETH_MAINNET: ['ETH', 'MAINNET'],
      TRON_NILE: ['TRON', 'NILE'],
      TRON_SHASTA: ['TRON', 'SHASTA'],
      TRON_MAINNET: ['TRON', 'MAINNET'],
    };
    const [type, network] = mapping[chain];
    return this.paymentConfigService.getActiveConfig(
      type as 'ETH' | 'TRON',
      network,
    ) as Promise<BlockchainGatewayConfig | null>;
  }

  private deriveAddress(chain: SupportedTreasuryChain, privateKey: string): string {
    if (chain === 'ETH_SEPOLIA' || chain === 'ETH_MAINNET') {
      return new ethers.Wallet(privateKey).address;
    }
    const addr = TronWeb.address.fromPrivateKey(privateKey);
    if (!addr) throw new Error('Invalid TRON private key');
    return addr;
  }
}
