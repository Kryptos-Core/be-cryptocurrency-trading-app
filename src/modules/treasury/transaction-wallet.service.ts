import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, FindOptionsWhere } from 'typeorm';
import { ethers, JsonRpcProvider } from 'ethers';
import { TronWeb } from 'tronweb';
import Decimal from 'decimal.js';
import { uuidv7 } from 'uuidv7';
import {
  BadRequestException,
  BusinessException,
  ConflictException,
  NotFoundException,
} from '@/common/exceptions';
import { CacheService, RedisService, WalletEncryptionService } from '@/common/services';
import { PaymentConfigService } from '@/modules/payment-config/payment-config.service';
import { BlockchainGatewayConfig } from '@/modules/payment-config/interfaces/payment-gateway-config.interface';
import { TransactionWallet } from '@/entities/transaction-wallet.entity';
import { CreateTransactionWalletDto, ListTreasuryWalletsDto } from './dto';

const LIST_CACHE_TTL_SECONDS = 60;

type SupportedTreasuryChain = 'ETH_SEPOLIA' | 'TRON_NILE' | 'TRON_SHASTA';

@Injectable()
export class TransactionWalletService {
  private readonly logger = new Logger(TransactionWalletService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly walletEncryptionService: WalletEncryptionService,
    private readonly cacheService: CacheService,
    private readonly redisService: RedisService,
    private readonly paymentConfigService: PaymentConfigService,
    private readonly configService: ConfigService,
  ) {}

  async createWallet(dto: CreateTransactionWalletDto): Promise<TransactionWallet> {
    const chain = this.assertSupportedChain(dto.chain);
    const account = await this.generateAccount(chain);

    const repo = this.dataSource.getRepository(TransactionWallet);
    const entity = repo.create({
      wallet_id: uuidv7(),
      chain,
      address: account.address,
      purpose: dto.purpose,
      encrypted_private_key: this.walletEncryptionService.encrypt(account.privateKey),
      label: dto.label?.trim() || null,
      is_active: true,
    });

    try {
      const created = await repo.save(entity);
      await this.cacheService.invalidatePattern('treasury:wallets:list:*');
      await this.publishEvent('wallet.created', {
        walletId: created.wallet_id,
        chain: created.chain,
        purpose: created.purpose,
      });
      return created;
    } catch (error: unknown) {
      const message = String((error as { message?: string })?.message ?? '');
      if (message.includes('uk_tx_wallet_chain_address')) {
        throw new ConflictException('Transaction wallet already exists', 'TX_WALLET_EXISTS');
      }
      throw error;
    }
  }

  async listWallets(filter: ListTreasuryWalletsDto): Promise<TransactionWallet[]> {
    const chain = filter.chain ?? 'ALL';
    const purpose = filter.purpose ?? 'ALL';
    const cacheKey = `treasury:wallets:list:${chain}:${purpose}`;

    return this.cacheService.getOrSet(
      cacheKey,
      async () => {
        const where: FindOptionsWhere<TransactionWallet> = {};
        if (filter.chain) where.chain = filter.chain;
        if (filter.purpose) where.purpose = filter.purpose;

        return this.dataSource.getRepository(TransactionWallet).find({
          where,
          order: { created_at: 'DESC' },
        });
      },
      LIST_CACHE_TTL_SECONDS,
    );
  }

  async getWalletById(walletId: string): Promise<TransactionWallet> {
    const wallet = await this.dataSource.getRepository(TransactionWallet).findOne({
      where: { wallet_id: walletId },
    });

    if (!wallet) {
      throw new NotFoundException('Transaction wallet', walletId);
    }

    return wallet;
  }

  async getWalletDetail(walletId: string): Promise<TransactionWallet & { balance: string; symbol: string }> {
    const wallet = await this.getWalletById(walletId);
    const balance = await this.getBalanceByAddress(wallet.chain, wallet.address);

    return {
      ...wallet,
      balance: balance.balance,
      symbol: balance.symbol,
    };
  }

  async getBalanceByAddress(chain: SupportedTreasuryChain, address: string): Promise<{ balance: string; symbol: string }> {
    if (chain === 'ETH_SEPOLIA') {
      const provider = this.buildEthereumProvider();
      const wei = await provider.getBalance(address);
      return {
        balance: ethers.formatEther(wei),
        symbol: 'ETH',
      };
    }

    const tronWeb = this.buildTronReadOnlyClient(chain);
    const sun = await tronWeb.trx.getBalance(address);
    return {
      balance: new Decimal(sun).div(1_000_000).toString(),
      symbol: 'TRX',
    };
  }

  async getMainWalletAddress(chain: SupportedTreasuryChain): Promise<string> {
    if (chain === 'ETH_SEPOLIA') {
      const key = await this.resolveMainWalletPrivateKey(chain);
      return new ethers.Wallet(key).address;
    }

    const key = await this.resolveMainWalletPrivateKey(chain);
    const address = TronWeb.address.fromPrivateKey(key);
    if (!address) {
      throw new BusinessException('TRON main wallet private key is invalid', 'TRON_MAIN_WALLET_INVALID');
    }
    return address;
  }

  async resolveMainWalletPrivateKey(chain: SupportedTreasuryChain): Promise<string> {
    if (chain === 'ETH_SEPOLIA') {
      const dbConfig = await this.paymentConfigService.getActiveConfig('ETH', 'SEPOLIA');
      const fromDb = (dbConfig as BlockchainGatewayConfig | null)?.hotWalletPrivateKey;
      const fromEnv = this.configService.get<string>('app.blockchain.ethereum.hotWalletPrivateKey');
      const privateKey = fromDb ?? fromEnv;
      if (!privateKey) {
        throw new BusinessException('ETH main wallet private key is not configured', 'ETH_MAIN_WALLET_NOT_CONFIGURED');
      }
      return privateKey;
    }

    const networkKey = chain === 'TRON_SHASTA' ? 'SHASTA' : 'NILE';
    const dbConfig = await this.paymentConfigService.getActiveConfig('TRON', networkKey);
    const fromDb = (dbConfig as BlockchainGatewayConfig | null)?.hotWalletPrivateKey;
    const fromEnv = this.configService.get<string>('app.blockchain.tron.hotWalletPrivateKey');
    const privateKey = fromDb ?? fromEnv;
    if (!privateKey) {
      throw new BusinessException('TRON main wallet private key is not configured', 'TRON_MAIN_WALLET_NOT_CONFIGURED');
    }
    return privateKey;
  }

  decryptWalletPrivateKey(wallet: TransactionWallet): string {
    return this.walletEncryptionService.decrypt(wallet.encrypted_private_key);
  }

  private assertSupportedChain(chain: string): SupportedTreasuryChain {
    if (chain !== 'ETH_SEPOLIA' && chain !== 'TRON_NILE' && chain !== 'TRON_SHASTA') {
      throw new BadRequestException('Unsupported treasury chain', 'TREASURY_CHAIN_UNSUPPORTED', { chain });
    }
    return chain;
  }

  private async generateAccount(chain: SupportedTreasuryChain): Promise<{ address: string; privateKey: string }> {
    if (chain === 'ETH_SEPOLIA') {
      const wallet = ethers.Wallet.createRandom();
      return {
        address: wallet.address,
        privateKey: wallet.privateKey,
      };
    }

    const account = await TronWeb.createAccount();
    return {
      address: account.address.base58,
      privateKey: account.privateKey,
    };
  }

  private buildEthereumProvider(): JsonRpcProvider {
    const rpcUrl =
      this.configService.get<string>('app.blockchain.ethereum.sepoliaRpcUrl') ??
      'https://rpc.sepolia.org';
    return new JsonRpcProvider(rpcUrl);
  }

  private buildTronReadOnlyClient(chain: 'TRON_NILE' | 'TRON_SHASTA'): TronWeb {
    const fullHost =
      chain === 'TRON_SHASTA'
        ? this.configService.get<string>('app.blockchain.tron.shastaFullHost') ??
          'https://api.shasta.trongrid.io'
        : this.configService.get<string>('app.blockchain.tron.nileFullHost') ??
          'https://nile.trongrid.io';

    return new TronWeb({ fullHost });
  }

  private async publishEvent(event: string, payload: Record<string, unknown>): Promise<void> {
    try {
      await this.redisService.publish(
        'treasury:events',
        JSON.stringify({ event, payload, timestamp: new Date().toISOString() }),
      );
    } catch (error) {
      this.logger.warn(`Failed to publish treasury event ${event}: ${(error as Error).message}`);
    }
  }
}
