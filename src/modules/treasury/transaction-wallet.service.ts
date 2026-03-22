import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FindOptionsWhere } from 'typeorm';
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
import { TreasuryTransactionWalletRepository } from './repositories/treasury-transaction-wallet.repository';

const LIST_CACHE_TTL_SECONDS = 60;
/** Short TTL: on-chain reads can lag right after a tx; stale values must expire quickly. */
const BALANCE_CACHE_TTL_SECONDS = 12;

type SupportedTreasuryChain =
  | 'ETH_SEPOLIA'
  | 'ETH_MAINNET'
  | 'TRON_NILE'
  | 'TRON_SHASTA'
  | 'TRON_MAINNET';

const TRON_DEPOSIT_UI_CHAINS = ['TRON_NILE', 'TRON_SHASTA'] as const;
type TronDepositUiChain = (typeof TRON_DEPOSIT_UI_CHAINS)[number];

export interface TreasuryWalletWithBalance extends Omit<TransactionWallet, 'encrypted_private_key'> {
  balance: string;
  symbol: string;
}

@Injectable()
export class TransactionWalletService {
  private readonly logger = new Logger(TransactionWalletService.name);

  constructor(
    private readonly treasuryTransactionWalletRepository: TreasuryTransactionWalletRepository,
    private readonly walletEncryptionService: WalletEncryptionService,
    private readonly cacheService: CacheService,
    private readonly redisService: RedisService,
    private readonly paymentConfigService: PaymentConfigService,
    private readonly configService: ConfigService,
  ) {}

  async createWallet(dto: CreateTransactionWalletDto): Promise<TransactionWallet> {
    const chain = this.assertSupportedChain(dto.chain);
    const account = await this.generateAccount(chain);

    try {
      const created = await this.treasuryTransactionWalletRepository.createAndSave({
        wallet_id: uuidv7(),
        chain,
        address: account.address,
        purpose: dto.purpose,
        encrypted_private_key: this.walletEncryptionService.encrypt(account.privateKey),
        label: dto.label?.trim() || null,
        is_active: true,
        is_default_user_deposit: false,
        default_set_at: null,
      });
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

  async listWallets(filter: ListTreasuryWalletsDto): Promise<TreasuryWalletWithBalance[]> {
    const chain = filter.chain ?? 'ALL';
    const purpose = filter.purpose ?? 'ALL';
    const cacheKey = `treasury:wallets:list:${chain}:${purpose}`;

    const wallets = await this.cacheService.getOrSet(
      cacheKey,
      async () => {
        const where: FindOptionsWhere<TransactionWallet> = {};
        if (filter.chain) where.chain = filter.chain;
        if (filter.purpose) where.purpose = filter.purpose;

        return this.treasuryTransactionWalletRepository.findManyOrdered(where);
      },
      LIST_CACHE_TTL_SECONDS,
    );

    const enriched = await Promise.all(
      wallets.map(async (w) => {
        const { balance, symbol } = await this.getBalanceCached(w.chain, w.address);
        const { encrypted_private_key: _, ...rest } = w;
        return { ...rest, balance, symbol } as TreasuryWalletWithBalance;
      }),
    );
    return enriched;
  }

  async getBalanceCached(
    chain: SupportedTreasuryChain,
    address: string,
  ): Promise<{ balance: string; symbol: string }> {
    const cacheKey = `treasury:balance:${chain}:${address}`;
    return this.cacheService.getOrSet(
      cacheKey,
      () => this.getBalanceByAddress(chain, address),
      BALANCE_CACHE_TTL_SECONDS,
    );
  }

  invalidateBalanceCache(chain: SupportedTreasuryChain, address: string): Promise<void> {
    const cacheKey = `treasury:balance:${chain}:${address}`;
    return this.cacheService.delete(cacheKey);
  }

  /** Clears cached on-chain balances for all treasury transaction wallets (after Fund/Sweep). */
  async invalidateAllTreasuryBalanceCaches(): Promise<void> {
    await this.cacheService.invalidatePattern('treasury:balance:*');
  }

  /**
   * After a TRON sweep is broadcast, public RPC often still returns the pre-tx balance briefly.
   * Poll until balance drops near the sweep reserve (0.1 TRX) or timeout, so UI cache is not primed with stale TRX.
   */
  async waitForTronBalanceReflectSweep(
    chain: 'TRON_NILE' | 'TRON_SHASTA' | 'TRON_MAINNET',
    address: string,
    reserveSun: number = 100_000,
  ): Promise<void> {
    const maxSun = reserveSun + 250_000;
    const deadline = Date.now() + 60_000;
    const tronWeb = this.buildTronReadOnlyClient(chain);
    while (Date.now() < deadline) {
      const sun = await tronWeb.trx.getBalance(address);
      if (sun <= maxSun) {
        return;
      }
      await new Promise((r) => setTimeout(r, 1_000));
    }
    this.logger.warn(
      `Treasury TRON sweep: balance for ${address} still > ${maxSun} sun after 60s; UI may lag until cache TTL`,
    );
  }

  async getWalletById(walletId: string): Promise<TransactionWallet> {
    const wallet = await this.treasuryTransactionWalletRepository.findByWalletId(walletId);

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
    if (chain === 'ETH_SEPOLIA' || chain === 'ETH_MAINNET') {
      const provider = this.buildEthereumProvider(chain);
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
    if (chain === 'ETH_SEPOLIA' || chain === 'ETH_MAINNET') {
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

    if (chain === 'ETH_MAINNET') {
      const dbConfig = await this.paymentConfigService.getActiveConfig('ETH', 'MAINNET');
      const fromDb = (dbConfig as BlockchainGatewayConfig | null)?.hotWalletPrivateKey;
      const fromEnv = this.configService.get<string>('app.blockchain.ethereum.hotWalletPrivateKey');
      const privateKey = fromDb ?? fromEnv;
      if (!privateKey) {
        throw new BusinessException('ETH mainnet wallet private key is not configured', 'ETH_MAINNET_WALLET_NOT_CONFIGURED');
      }
      return privateKey;
    }

    const networkKey = chain === 'TRON_SHASTA' ? 'SHASTA' : chain === 'TRON_MAINNET' ? 'MAINNET' : 'NILE';
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

  /**
   * Wallets that may receive user deposits (shown on deposit config UI): Tron testnets, DEPOSIT or BOTH.
   */
  async listWalletsForDepositConfiguration(): Promise<TransactionWallet[]> {
    return this.treasuryTransactionWalletRepository.findForDepositConfiguration();
  }

  async getDefaultUserDepositWallet(
    chain: TronDepositUiChain,
  ): Promise<TransactionWallet | null> {
    return this.treasuryTransactionWalletRepository.findDefaultUserDepositWallet(chain);
  }

  async setDefaultUserDeposit(walletId: string): Promise<TransactionWallet> {
    const wallet = await this.treasuryTransactionWalletRepository.findByWalletId(walletId);

    if (!wallet) {
      throw new NotFoundException('Transaction wallet', walletId);
    }
    if (!wallet.is_active) {
      throw new BadRequestException('Inactive wallet cannot be default', 'WALLET_INACTIVE');
    }
    if (wallet.purpose === 'WITHDRAWAL') {
      throw new BadRequestException(
        'Only DEPOSIT or BOTH wallets can be the user deposit default',
        'TX_WALLET_PURPOSE_NOT_DEPOSIT',
      );
    }
    if (!TRON_DEPOSIT_UI_CHAINS.includes(wallet.chain as TronDepositUiChain)) {
      throw new BadRequestException(
        'User deposit default is only supported for Tron Nile/Shasta',
        'TX_WALLET_CHAIN_NOT_SUPPORTED_FOR_DEPOSIT_UI',
      );
    }

    const updated = await this.treasuryTransactionWalletRepository.setDefaultUserDepositInTransaction(wallet);
    await this.cacheService.invalidatePattern('treasury:wallets:list:*');
    return updated;
  }

  async deactivateWallet(walletId: string): Promise<void> {
    const wallet = await this.treasuryTransactionWalletRepository.findByWalletId(walletId);
    if (!wallet) {
      throw new NotFoundException('Transaction wallet', walletId);
    }
    if (wallet.is_default_user_deposit) {
      throw new BadRequestException(
        'Cannot deactivate the current default user deposit wallet',
        'DEFAULT_USER_DEPOSIT_DEACTIVATE_FORBIDDEN',
      );
    }
    wallet.is_active = false;
    await this.treasuryTransactionWalletRepository.save(wallet);
    await this.cacheService.invalidatePattern('treasury:wallets:list:*');
  }

  /**
   * Active treasury wallet used to sign user withdrawals on this chain.
   * Prefers purpose WITHDRAWAL over BOTH; then newest by created_at.
   * Returns null for chains without transaction_wallets (e.g. Solana) or when none configured.
   */
  async getWithdrawalSourceWallet(chain: string): Promise<TransactionWallet | null> {
    if (!this.isTreasuryChain(chain)) {
      return null;
    }
    const wallets = await this.treasuryTransactionWalletRepository.findActiveWithdrawalCandidates(
      chain as SupportedTreasuryChain,
    );
    if (!wallets.length) {
      return null;
    }
    wallets.sort((a, b) => {
      const rank = (p: string) => (p === 'WITHDRAWAL' ? 0 : 1);
      const c = rank(a.purpose) - rank(b.purpose);
      if (c !== 0) {
        return c;
      }
      return b.created_at.getTime() - a.created_at.getTime();
    });
    return wallets[0] ?? null;
  }

  /**
   * Send native coin (TRX / ETH) from a transaction wallet to a user destination.
   */
  async sendWithdrawalNativeTransfer(
    wallet: TransactionWallet,
    toAddress: string,
    amount: string,
  ): Promise<string> {
    const chain = this.assertSupportedChain(wallet.chain);
    const pk = this.walletEncryptionService.decrypt(wallet.encrypted_private_key);

    if (chain === 'ETH_SEPOLIA' || chain === 'ETH_MAINNET') {
      if (!ethers.isAddress(toAddress)) {
        throw new BadRequestException('Invalid ETH destination address', 'INVALID_ETH_ADDRESS');
      }
      const provider = this.buildEthereumProvider(chain);
      const signer = new ethers.Wallet(pk, provider);
      const tx = await signer.sendTransaction({
        to: toAddress,
        value: ethers.parseEther(amount),
      });
      this.logger.log(`Withdrawal ETH sent from tx wallet ${wallet.wallet_id}: ${tx.hash}`);
      return tx.hash;
    }

    const tw = this.buildTronWebWithPrivateKey(chain, pk);
    if (!tw.isAddress(toAddress)) {
      throw new BadRequestException('Invalid Tron destination address', 'INVALID_TRON_ADDRESS');
    }
    const sunAmount = Math.floor(Number(new Decimal(amount).mul(1_000_000).toString()));
    const sent = await tw.trx.sendTransaction(toAddress, sunAmount);
    if (!sent?.result || !sent?.txid) {
      throw new BusinessException(
        'Failed to submit Tron withdrawal transaction',
        'TRON_WITHDRAWAL_SEND_FAILED',
      );
    }
    this.logger.log(`Withdrawal TRX sent from tx wallet ${wallet.wallet_id}: ${sent.txid}`);
    return sent.txid;
  }

  private isTreasuryChain(chain: string): chain is SupportedTreasuryChain {
    return ['ETH_SEPOLIA', 'ETH_MAINNET', 'TRON_NILE', 'TRON_SHASTA', 'TRON_MAINNET'].includes(chain);
  }

  private buildTronWebWithPrivateKey(
    chain: 'TRON_NILE' | 'TRON_SHASTA' | 'TRON_MAINNET',
    privateKey: string,
  ): TronWeb {
    const fullHost =
      chain === 'TRON_SHASTA'
        ? (this.configService.get<string>('app.blockchain.tron.shastaFullHost') ?? 'https://api.shasta.trongrid.io')
        : chain === 'TRON_MAINNET'
          ? (this.configService.get<string>('app.blockchain.tron.mainnetFullHost') ?? 'https://api.trongrid.io')
          : (this.configService.get<string>('app.blockchain.tron.nileFullHost') ?? 'https://nile.trongrid.io');

    return new TronWeb({ fullHost, privateKey });
  }

  private assertSupportedChain(chain: string): SupportedTreasuryChain {
    const supported = ['ETH_SEPOLIA', 'ETH_MAINNET', 'TRON_NILE', 'TRON_SHASTA', 'TRON_MAINNET'];
    if (!supported.includes(chain)) {
      throw new BadRequestException('Unsupported treasury chain', 'TREASURY_CHAIN_UNSUPPORTED', { chain });
    }
    return chain as SupportedTreasuryChain;
  }

  private async generateAccount(chain: SupportedTreasuryChain): Promise<{ address: string; privateKey: string }> {
    if (chain === 'ETH_SEPOLIA' || chain === 'ETH_MAINNET') {
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

  private buildEthereumProvider(chain: 'ETH_SEPOLIA' | 'ETH_MAINNET'): JsonRpcProvider {
    const rpcUrl =
      chain === 'ETH_MAINNET'
        ? (this.configService.get<string>('app.blockchain.ethereum.mainnetRpcUrl') ?? 'https://eth.llamarpc.com')
        : (this.configService.get<string>('app.blockchain.ethereum.sepoliaRpcUrl') ?? 'https://rpc.sepolia.org');
    return new JsonRpcProvider(rpcUrl);
  }

  private buildTronReadOnlyClient(
    chain: 'TRON_NILE' | 'TRON_SHASTA' | 'TRON_MAINNET',
  ): TronWeb {
    const fullHost =
      chain === 'TRON_SHASTA'
        ? (this.configService.get<string>('app.blockchain.tron.shastaFullHost') ?? 'https://api.shasta.trongrid.io')
        : chain === 'TRON_MAINNET'
          ? (this.configService.get<string>('app.blockchain.tron.mainnetFullHost') ?? 'https://api.trongrid.io')
          : (this.configService.get<string>('app.blockchain.tron.nileFullHost') ?? 'https://nile.trongrid.io');

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
