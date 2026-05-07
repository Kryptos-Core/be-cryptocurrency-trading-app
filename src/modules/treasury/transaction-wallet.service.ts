import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  sendAndConfirmTransaction,
  Transaction,
} from '@solana/web3.js';
import bs58 from 'bs58';
import Decimal from 'decimal.js';
import { ethers } from 'ethers';
import { TronWeb } from 'tronweb';
import { type FindOptionsWhere } from 'typeorm';
import { uuidv7 } from 'uuidv7';
import {
  BLOCKCHAIN_CHAIN_DB_VALUES,
  type BlockchainChainDbValue,
} from '@/common/constants/blockchain-chain-db';
import { getEvmDefinitionByTreasuryChain } from '@/common/constants/evm-chain-definitions';
import {
  BadRequestException,
  BusinessException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from '@/common/exceptions';
import { CacheService, RedisService, WalletEncryptionService } from '@/common/services';
import { WorkerPoolService } from '@/common/worker-pool/worker-pool.service';
import { SystemConfigService } from '@/modules/system-config/system-config.service';
import type { TransactionWalletRecord } from '@/modules/treasury';
import {
  TREASURY_MAIN_WALLET_REPOSITORY,
  TREASURY_OPERATION_REPOSITORY,
  TREASURY_TRANSACTION_WALLET_REPOSITORY,
  type TreasuryMainWalletRepositoryPort,
  type TreasuryOperationRepositoryPort,
  type TreasuryTransactionWalletRepositoryPort,
} from './domain/ports';
import type { CreateTransactionWalletDto, ListTreasuryWalletsDto } from './dto';
import {
  TRON_DEPOSIT_UI_CHAINS,
  type TronDepositUiChain,
} from './infrastructure/persistence/treasury-transaction-wallet.repository';
import { jsonRpcProviderForTreasuryEvmChain } from './treasury-evm-json-rpc.helper';
import {
  TRON_USDT_CONTRACT,
  TRON_USDT_DECIMALS,
  type TronTreasuryNetwork,
} from './treasury-tron-usdt-contracts';

const LIST_CACHE_TTL_SECONDS = 60;
/** Short TTL: on-chain reads can lag right after a tx; stale values must expire quickly. */
const BALANCE_CACHE_TTL_SECONDS = 12;
const BALANCE_STALE_CACHE_TTL_SECONDS = 15 * 60;
const LIST_BALANCE_CONCURRENCY = 3;

type SupportedTreasuryChain = BlockchainChainDbValue;

const TRC20_BALANCE_OF_ABI = [
  {
    constant: true,
    inputs: [{ name: '_owner', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: 'balance', type: 'uint256' }],
    type: 'function',
  },
] as const;

const TRC20_TRANSFER_ABI = [
  {
    constant: false,
    /** Required by TronWeb `_send` (uses `stateMutability.toLowerCase()`). */
    stateMutability: 'nonpayable' as const,
    inputs: [
      { name: '_to', type: 'address' },
      { name: '_value', type: 'uint256' },
    ],
    name: 'transfer',
    outputs: [{ name: '', type: 'bool' }],
    type: 'function',
  },
] as const;

export interface TreasuryOnChainBalances {
  balance: string;
  symbol: string;
  /** Human-readable USDT (TRC-20), TRON networks only */
  usdtTrc20Balance?: string;
}

export interface TreasuryWalletWithBalance
  extends Omit<TransactionWalletRecord, 'encrypted_private_key'> {
  balance: string;
  symbol: string;
  usdtTrc20Balance?: string;
}

@Injectable()
export class TransactionWalletService {
  private readonly logger = new Logger(TransactionWalletService.name);

  constructor(
    @Inject(TREASURY_TRANSACTION_WALLET_REPOSITORY)
    private readonly treasuryTransactionWalletRecordRepository: TreasuryTransactionWalletRepositoryPort,
    @Inject(TREASURY_OPERATION_REPOSITORY)
    private readonly treasuryOperationRepository: TreasuryOperationRepositoryPort,
    @Inject(TREASURY_MAIN_WALLET_REPOSITORY)
    private readonly treasuryMainWalletRepo: TreasuryMainWalletRepositoryPort,
    private readonly walletEncryptionService: WalletEncryptionService,
    private readonly cacheService: CacheService,
    private readonly redisService: RedisService,
    readonly _configService: ConfigService,
    private readonly systemConfigService: SystemConfigService,
    private readonly workerPool: WorkerPoolService,
  ) {}

  async createWallet(dto: CreateTransactionWalletDto): Promise<TransactionWalletRecord> {
    const chain = this.assertSupportedChain(dto.chain);
    const account = await this.generateAccount(chain);

    try {
      const created = await this.treasuryTransactionWalletRecordRepository.createAndSave({
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
        const where: FindOptionsWhere<TransactionWalletRecord> = {};
        if (filter.chain) where.chain = filter.chain;
        if (filter.purpose) where.purpose = filter.purpose;

        return this.treasuryTransactionWalletRecordRepository.findManyOrdered(where);
      },
      LIST_CACHE_TTL_SECONDS,
    );

    return mapWithConcurrency(wallets, LIST_BALANCE_CONCURRENCY, async (w) => {
      const { encrypted_private_key: _, ...rest } = w;
      try {
        const { balance, symbol, usdtTrc20Balance } = await this.getBalanceCached(
          w.chain,
          w.address,
        );
        return {
          ...rest,
          balance,
          symbol,
          ...(usdtTrc20Balance != null ? { usdtTrc20Balance } : {}),
        } as TreasuryWalletWithBalance;
      } catch (error) {
        if (!this.isTronRateLimitError(error)) {
          throw error;
        }
        this.logger.warn(
          `Balance lookup rate-limited for ${w.wallet_id} on ${w.chain}: ${(error as Error).message}`,
        );
        return {
          ...rest,
          balance: '0',
          symbol: this.getFallbackSymbolForChain(w.chain),
        } as TreasuryWalletWithBalance;
      }
    });
  }

  async getBalanceCached(
    chain: SupportedTreasuryChain,
    address: string,
  ): Promise<TreasuryOnChainBalances> {
    const cacheKey = `treasury:balance:${chain}:${address}`;
    const staleCacheKey = `${cacheKey}:stale`;

    const cached = await this.cacheService.get<TreasuryOnChainBalances>(cacheKey);
    if (cached !== null) {
      return cached;
    }

    try {
      const value = await this.getBalanceByAddress(chain, address);
      await this.cacheService.set(cacheKey, value, BALANCE_CACHE_TTL_SECONDS);
      await this.cacheService.set(staleCacheKey, value, BALANCE_STALE_CACHE_TTL_SECONDS);
      return value;
    } catch (error) {
      const stale = await this.cacheService.get<TreasuryOnChainBalances>(staleCacheKey);
      if (stale !== null && this.isTronRateLimitError(error)) {
        this.logger.warn(
          `Using stale balance for ${address} on ${chain} after rate limit: ${(error as Error).message}`,
        );
        await this.cacheService.set(cacheKey, stale, BALANCE_CACHE_TTL_SECONDS);
        return stale;
      }
      throw error;
    }
  }

  invalidateBalanceCache(chain: SupportedTreasuryChain, address: string): Promise<void> {
    const cacheKey = `treasury:balance:${chain}:${address}`;
    return this.cacheService.deleteMany(cacheKey, `${cacheKey}:stale`);
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
    chain: 'TRON_MAINNET' | 'TRON_NILE' | 'TRON_SHASTA',
    address: string,
    reserveSun: number = 100_000,
  ): Promise<void> {
    const maxSun = reserveSun + 250_000;
    const deadline = Date.now() + 60_000;
    const tronWeb = await this.buildTronReadOnlyClient(chain);
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

  /** Native TRX balance (sun) — snapshot before Fund for post-broadcast polling. */
  async getTronNativeBalanceSun(
    chain: 'TRON_MAINNET' | 'TRON_NILE' | 'TRON_SHASTA',
    address: string,
  ): Promise<number> {
    const tronWeb = await this.buildTronReadOnlyClient(chain);
    return tronWeb.trx.getBalance(address);
  }

  /**
   * After TRON fund broadcast, public RPC often returns stale balance briefly — poll until balance
   * rises above pre-tx snapshot so the next API read after cache invalidation is not re-primed wrong.
   */
  async waitForTronBalanceReflectFund(
    chain: 'TRON_MAINNET' | 'TRON_NILE' | 'TRON_SHASTA',
    address: string,
    balanceSunBeforeTx: number,
  ): Promise<void> {
    const deadline = Date.now() + 60_000;
    const tronWeb = await this.buildTronReadOnlyClient(chain);
    while (Date.now() < deadline) {
      const sun = await tronWeb.trx.getBalance(address);
      if (sun > balanceSunBeforeTx) {
        return;
      }
      await new Promise((r) => setTimeout(r, 1_000));
    }
    this.logger.warn(
      `Treasury TRON fund: balance for ${address} did not increase above pre-tx ${balanceSunBeforeTx} sun after 60s; UI may lag until cache TTL`,
    );
  }

  /**
   * Poll on-chain USDT (TRC-20) until it increases (no cache), for post–USDT-fund UI freshness.
   * @returns true if balance increased before timeout
   */
  async waitForTronUsdtBalanceReflectFund(
    chain: TronTreasuryNetwork,
    address: string,
    usdtHumanBefore: string,
  ): Promise<boolean> {
    const before = new Decimal(usdtHumanBefore);
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
      const human = new Decimal(await this.getTronUsdtHumanBalanceOnChain(chain, address));
      if (human.gt(before)) {
        return true;
      }
      await new Promise((r) => setTimeout(r, 1_500));
    }
    this.logger.warn(
      `Treasury TRON USDT fund: USDT balance for ${address} did not increase above ${usdtHumanBefore} after 90s`,
    );
    return false;
  }

  /**
   * Poll on-chain USDT until it drops after a sweep (no cache).
   * @returns true if balance decreased before timeout
   */
  async waitForTronUsdtBalanceReflectSweep(
    chain: TronTreasuryNetwork,
    address: string,
    usdtHumanBeforeSweep: string,
  ): Promise<boolean> {
    const before = new Decimal(usdtHumanBeforeSweep);
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
      const human = new Decimal(await this.getTronUsdtHumanBalanceOnChain(chain, address));
      if (human.lt(before)) {
        return true;
      }
      await new Promise((r) => setTimeout(r, 1_500));
    }
    this.logger.warn(
      `Treasury TRON USDT sweep: USDT balance for ${address} did not drop below pre-sweep ${usdtHumanBeforeSweep} after 90s`,
    );
    return false;
  }

  /**
   * Send TRC-20 USDT from a private key wallet to a recipient (Tron networks only).
   */
  async transferTronUsdtFromPrivateKey(
    chain: TronTreasuryNetwork,
    privateKey: string,
    toBase58: string,
    amountHuman: string,
  ): Promise<string> {
    const tw = await this.buildTronWebWithPrivateKey(chain, privateKey);
    if (!tw.isAddress(toBase58)) {
      throw new BadRequestException('Invalid Tron destination address', 'INVALID_TRON_ADDRESS');
    }
    await this.assertTronAccountExistsOrThrow(tw, toBase58, 'TRON_USDT_DESTINATION_NOT_ACTIVATED');
    const valueInt = new Decimal(amountHuman).mul(new Decimal(10).pow(TRON_USDT_DECIMALS)).floor();
    if (valueInt.lte(0)) {
      throw new BadRequestException(
        'USDT amount must be greater than zero',
        'TREASURY_INVALID_AMOUNT',
      );
    }
    const contractAddress = TRON_USDT_CONTRACT[chain];
    const contract = tw.contract(TRC20_TRANSFER_ABI as unknown as never[], contractAddress);
    const fromAddr = tw.address.fromPrivateKey(privateKey);
    if (!fromAddr) {
      throw new BusinessException(
        'Invalid Tron private key for USDT transfer',
        'TRON_USDT_SEND_INVALID_KEY',
      );
    }
    const raw = await contract.transfer(toBase58, valueInt.toFixed(0)).send({
      feeLimit: 150_000_000,
      callValue: 0,
      from: fromAddr,
      /** Wait for solidity result so we do not mark COMPLETED on a tx that reverts (e.g. no TRX for energy). */
      shouldPollResponse: true,
      /** With shouldPollResponse, TronWeb returns decoded output unless keepTxID is set. */
      keepTxID: true,
      pollTimes: 40,
    });
    const txid = TransactionWalletService.parseTronContractSendTxId(raw);
    if (!txid) {
      throw new BusinessException(
        'Failed to resolve TRON USDT transfer tx id',
        'TRON_USDT_SEND_FAILED',
      );
    }
    return txid;
  }

  /** Normalize TronWeb `method.send()` return value (string txID, [txID, decoded], or legacy object). */
  private static parseTronContractSendTxId(raw: unknown): string | null {
    if (typeof raw === 'string' && raw.length >= 16) {
      return raw;
    }
    if (
      Array.isArray(raw) &&
      raw.length > 0 &&
      typeof raw[0] === 'string' &&
      (raw[0] as string).length >= 16
    ) {
      return raw[0] as string;
    }
    if (raw && typeof raw === 'object') {
      const o = raw as { txid?: unknown; transaction?: { txID?: unknown } };
      if (typeof o.txid === 'string' && o.txid.length >= 16) {
        return o.txid;
      }
      const nested = o.transaction?.txID;
      if (typeof nested === 'string' && nested.length >= 16) {
        return nested;
      }
    }
    return null;
  }

  /**
   * Sweep all TRC-20 USDT from a treasury transaction wallet to the main address.
   */
  async sweepAllTronUsdtFromWallet(
    wallet: TransactionWalletRecord,
    toMainBase58: string,
  ): Promise<{ txHash: string; amount: string }> {
    const chain = this.assertSupportedChain(wallet.chain);
    if (chain !== 'TRON_MAINNET' && chain !== 'TRON_NILE' && chain !== 'TRON_SHASTA') {
      throw new BadRequestException(
        'USDT sweep is only supported on Tron networks',
        'TREASURY_USDT_CHAIN',
      );
    }
    const pk = this.walletEncryptionService.decrypt(wallet.encrypted_private_key);
    const human = await this.getTronUsdtHumanBalanceOnChain(chain, wallet.address);
    const amount = new Decimal(human);
    if (amount.lte(0)) {
      throw new BusinessException('No USDT balance to sweep', 'TREASURY_SWEEP_USDT_ZERO');
    }
    const txHash = await this.transferTronUsdtFromPrivateKey(chain, pk, toMainBase58, human);
    return { txHash, amount: human };
  }

  async getWalletById(walletId: string): Promise<TransactionWalletRecord> {
    const wallet = await this.treasuryTransactionWalletRecordRepository.findByWalletId(walletId);

    if (!wallet) {
      throw new NotFoundException('Transaction wallet', walletId);
    }

    return wallet;
  }

  async getWalletDetail(
    walletId: string,
  ): Promise<
    TransactionWalletRecord & { balance: string; symbol: string; usdtTrc20Balance?: string }
  > {
    const wallet = await this.getWalletById(walletId);
    const b = await this.getBalanceCached(wallet.chain, wallet.address);

    return {
      ...wallet,
      balance: b.balance,
      symbol: b.symbol,
      ...(b.usdtTrc20Balance != null ? { usdtTrc20Balance: b.usdtTrc20Balance } : {}),
    };
  }

  async getBalanceByAddress(
    chain: SupportedTreasuryChain,
    address: string,
  ): Promise<TreasuryOnChainBalances> {
    const evmDef = getEvmDefinitionByTreasuryChain(chain);
    if (evmDef) {
      const provider = await jsonRpcProviderForTreasuryEvmChain(chain, this.systemConfigService);
      const wei = await provider.getBalance(address);
      return {
        balance: ethers.formatEther(wei),
        symbol: evmDef.nativeSymbol,
      };
    }

    if (chain === 'SOLANA_MAINNET' || chain === 'SOLANA_DEVNET') {
      const connection = await this.buildSolanaConnection(chain);
      const lamports = await connection.getBalance(new PublicKey(address));
      return {
        balance: new Decimal(lamports).div(1_000_000_000).toString(),
        symbol: 'SOL',
      };
    }

    if (chain === 'TRON_MAINNET' || chain === 'TRON_NILE' || chain === 'TRON_SHASTA') {
      const tronWeb = await this.buildTronReadOnlyClient(chain);
      const sun = await this.retryTronRead(
        () => tronWeb.trx.getBalance(address),
        `TRX balance ${address} on ${chain}`,
      );
      const usdtTrc20Balance = await this.retryTronRead(
        () => this.readTronUsdtBalance(tronWeb, chain, address),
        `USDT TRC-20 balance ${address} on ${chain}`,
      );
      return {
        balance: new Decimal(sun).div(1_000_000).toString(),
        symbol: 'TRX',
        usdtTrc20Balance,
      };
    }

    throw new BadRequestException('Unsupported treasury chain', 'TREASURY_CHAIN_UNSUPPORTED', {
      chain,
    });
  }

  /** Direct on-chain USDT (TRC-20) human balance — not Redis-cached. */
  async getTronUsdtHumanBalanceOnChain(
    chain: TronTreasuryNetwork,
    ownerBase58: string,
  ): Promise<string> {
    const tronWeb = await this.buildTronReadOnlyClient(chain);
    return this.readTronUsdtBalance(tronWeb, chain, ownerBase58);
  }

  private async readTronUsdtBalance(
    tronWeb: TronWeb,
    chain: TronTreasuryNetwork,
    ownerBase58: string,
  ): Promise<string> {
    const contractAddress = TRON_USDT_CONTRACT[chain];
    const contract = tronWeb.contract(TRC20_BALANCE_OF_ABI as unknown as never[], contractAddress);
    // Read-only TronWeb has no defaultAddress; empty `from` yields undefined owner_address on the node.
    const raw = await contract.balanceOf(ownerBase58).call({ from: ownerBase58 });
    const rawStr =
      typeof raw === 'object' && raw !== null && 'balance' in raw
        ? String((raw as { balance: unknown }).balance)
        : String(raw);
    return new Decimal(rawStr).div(new Decimal(10).pow(TRON_USDT_DECIMALS)).toString();
  }

  async getMainWalletAddress(chain: SupportedTreasuryChain): Promise<string> {
    if (getEvmDefinitionByTreasuryChain(chain)) {
      const key = await this.resolveMainWalletPrivateKey(chain);
      return new ethers.Wallet(key).address;
    }

    if (chain === 'SOLANA_MAINNET' || chain === 'SOLANA_DEVNET') {
      const key = await this.resolveMainWalletPrivateKey(chain);
      const decoded = bs58.decode(key);
      const keypair = Keypair.fromSecretKey(decoded);
      return keypair.publicKey.toBase58();
    }

    const key = await this.resolveMainWalletPrivateKey(chain);
    const address = TronWeb.address.fromPrivateKey(key);
    if (!address) {
      throw new BusinessException(
        'TRON main wallet private key is invalid',
        'TRON_MAIN_WALLET_INVALID',
      );
    }
    return address;
  }

  /**
   * Resolve the private key for the active default main wallet on a given chain.
   * Uses TreasuryMainWalletRepositoryPort (injected as port) to avoid circular dependency
   * with TreasuryMainWalletService (which injects TransactionWalletService for balance queries).
   */
  async resolveMainWalletPrivateKey(chain: SupportedTreasuryChain): Promise<string> {
    const wallet = await this.treasuryMainWalletRepo.findActiveDefaultOnChain(chain);
    if (!wallet) {
      throw new BusinessException(
        `No active default main wallet configured for chain ${chain}. ` +
          `Import via POST /treasury/main-wallets and approve via PATCH /treasury/main-wallets/:id/approve.`,
        'TREASURY_MAIN_WALLET_NOT_CONFIGURED',
      );
    }
    return this.walletEncryptionService.decrypt(wallet.encrypted_private_key);
  }

  decryptWalletPrivateKey(wallet: TransactionWalletRecord): string {
    return this.walletEncryptionService.decrypt(wallet.encrypted_private_key);
  }

  /**
   * Wallets that may receive user deposits (shown on deposit config UI): Tron mainnet, DEPOSIT or BOTH.
   */
  async listWalletsForDepositConfiguration(): Promise<TransactionWalletRecord[]> {
    return this.treasuryTransactionWalletRecordRepository.findForDepositConfiguration();
  }

  async getDefaultUserDepositWallet(
    chain: BlockchainChainDbValue,
  ): Promise<TransactionWalletRecord | null> {
    return this.treasuryTransactionWalletRecordRepository.findDefaultUserDepositWallet(chain);
  }

  async setDefaultUserDeposit(walletId: string): Promise<TransactionWalletRecord> {
    const wallet = await this.treasuryTransactionWalletRecordRepository.findByWalletId(walletId);

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
        'User deposit default is only supported for Tron mainnet (TRC-20)',
        'TX_WALLET_CHAIN_NOT_SUPPORTED_FOR_DEPOSIT_UI',
      );
    }

    const updated =
      await this.treasuryTransactionWalletRecordRepository.setDefaultUserDepositInTransaction(
        wallet,
      );
    await this.cacheService.invalidatePattern('treasury:wallets:list:*');
    return updated;
  }

  /**
   * Clears the user-facing default deposit flag for this wallet. Chain may temporarily
   * have no default until another wallet is set (deposit UI falls back to main hot wallet).
   */
  async unsetDefaultUserDeposit(walletId: string): Promise<TransactionWalletRecord> {
    const wallet = await this.treasuryTransactionWalletRecordRepository.findByWalletId(walletId);

    if (!wallet) {
      throw new NotFoundException('Transaction wallet', walletId);
    }
    if (wallet.purpose === 'WITHDRAWAL') {
      throw new BadRequestException(
        'Only DEPOSIT or BOTH wallets participate in user deposit defaults',
        'TX_WALLET_PURPOSE_NOT_DEPOSIT',
      );
    }
    if (!TRON_DEPOSIT_UI_CHAINS.includes(wallet.chain as TronDepositUiChain)) {
      throw new BadRequestException(
        'User deposit default is only supported for Tron mainnet (TRC-20)',
        'TX_WALLET_CHAIN_NOT_SUPPORTED_FOR_DEPOSIT_UI',
      );
    }
    if (!wallet.is_default_user_deposit) {
      return wallet;
    }

    wallet.is_default_user_deposit = false;
    wallet.default_set_at = null;
    const saved = await this.treasuryTransactionWalletRecordRepository.save(wallet);
    await this.cacheService.invalidatePattern('treasury:wallets:list:*');
    return saved;
  }

  async deactivateWallet(walletId: string): Promise<void> {
    const wallet = await this.treasuryTransactionWalletRecordRepository.findByWalletId(walletId);
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
    await this.treasuryTransactionWalletRecordRepository.save(wallet);
    await this.cacheService.invalidatePattern('treasury:wallets:list:*');
  }

  /**
   * Permanently remove a transaction wallet. Requires near-zero on-chain balance, no in-flight
   * Fund/Sweep, and must not be the user deposit default.
   */
  async deleteWallet(walletId: string, actorUserId: string): Promise<void> {
    const wallet = await this.getWalletById(walletId);
    if (wallet.is_default_user_deposit) {
      throw new BadRequestException(
        'Unset this wallet as the user deposit default before deleting it',
        'TX_WALLET_DEFAULT_DEPOSIT_DELETE_FORBIDDEN',
      );
    }
    const inFlight = await this.treasuryOperationRepository.countNonTerminalForWallet(walletId);
    if (inFlight > 0) {
      throw new BadRequestException(
        'Wait for pending Fund/Sweep operations to finish before deleting this wallet',
        'TX_WALLET_OPERATION_IN_FLIGHT',
      );
    }
    const balInfo = await this.getBalanceByAddress(wallet.chain, wallet.address);
    const bal = new Decimal(balInfo.balance);
    const maxAllowed = this._maxBalanceToAllowDelete(balInfo.symbol);
    if (bal.gt(maxAllowed)) {
      throw new BadRequestException(
        `Sweep funds first (on-chain balance must be at most ${maxAllowed.toString()} ${balInfo.symbol})`,
        'TX_WALLET_NON_ZERO_BALANCE',
      );
    }
    if (balInfo.usdtTrc20Balance != null && new Decimal(balInfo.usdtTrc20Balance).gt('0.000001')) {
      throw new BadRequestException(
        'Transfer TRC-20 USDT off this wallet before deleting it',
        'TX_WALLET_USDT_NON_ZERO',
      );
    }
    await this.treasuryTransactionWalletRecordRepository.deleteByWalletId(walletId);
    await this.invalidateBalanceCache(wallet.chain, wallet.address);
    await this.cacheService.invalidatePattern('treasury:wallets:list:*');
    this.logger.log(
      `Transaction wallet deleted: ${walletId} chain=${wallet.chain} address=${wallet.address} by ${actorUserId}`,
    );
    await this.publishEvent('wallet.deleted', {
      walletId,
      chain: wallet.chain,
      address: wallet.address,
      deletedBy: actorUserId,
    });
  }

  private _maxBalanceToAllowDelete(symbol: string): Decimal {
    switch (symbol.toUpperCase()) {
      case 'TRX':
        return new Decimal('0.15');
      case 'ETH':
        return new Decimal('0.00005');
      case 'SOL':
        return new Decimal('0.00002');
      default:
        return new Decimal('0');
    }
  }

  /**
   * Active treasury wallet used to sign user withdrawals on this chain.
   * Prefers purpose WITHDRAWAL over BOTH; then newest by created_at.
   * Returns null for chains without transaction_wallets (e.g. Solana) or when none configured.
   */
  async getWithdrawalSourceWallet(chain: string): Promise<TransactionWalletRecord | null> {
    if (!this.isTreasuryChain(chain)) {
      return null;
    }
    const wallets =
      await this.treasuryTransactionWalletRecordRepository.findActiveWithdrawalCandidates(
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
    wallet: TransactionWalletRecord,
    toAddress: string,
    amount: string,
  ): Promise<string> {
    const chain = this.assertSupportedChain(wallet.chain);
    const pk = this.walletEncryptionService.decrypt(wallet.encrypted_private_key);

    if (getEvmDefinitionByTreasuryChain(chain)) {
      if (!ethers.isAddress(toAddress)) {
        throw new BadRequestException('Invalid EVM destination address', 'INVALID_EVM_ADDRESS');
      }
      const provider = await jsonRpcProviderForTreasuryEvmChain(chain, this.systemConfigService);
      const signer = new ethers.Wallet(pk, provider);
      const tx = await signer.sendTransaction({
        to: toAddress,
        value: ethers.parseEther(amount),
      });
      this.logger.log(`Withdrawal EVM native sent from tx wallet ${wallet.wallet_id}: ${tx.hash}`);
      return tx.hash;
    }

    if (chain === 'SOLANA_MAINNET' || chain === 'SOLANA_DEVNET') {
      const connection = await this.buildSolanaConnection(chain);
      const decodedKey = bs58.decode(pk);
      const keypair = Keypair.fromSecretKey(decodedKey);
      const lamports = Math.floor(new Decimal(amount).mul(1_000_000_000).toNumber());

      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: keypair.publicKey,
          toPubkey: new PublicKey(toAddress),
          lamports,
        }),
      );

      const txHash = await sendAndConfirmTransaction(connection, tx, [keypair]);
      this.logger.log(`Withdrawal SOL sent from tx wallet ${wallet.wallet_id}: ${txHash}`);
      return txHash;
    }

    const tw = await this.buildTronWebWithPrivateKey(chain, pk);
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
    return (BLOCKCHAIN_CHAIN_DB_VALUES as readonly string[]).includes(chain);
  }

  private async resolveTronFullHost(chain: string): Promise<string> {
    if (chain === 'TRON_NILE') {
      const v = await this.systemConfigService.get<string>('TRON_NILE_FULL_HOST');
      if (v?.trim()) return v.trim();
      return process.env.TRON_NILE_FULL_HOST?.trim() || 'https://nile.trongrid.io';
    }
    if (chain === 'TRON_SHASTA') {
      const v = await this.systemConfigService.get<string>('TRON_SHASTA_FULL_HOST');
      if (v?.trim()) return v.trim();
      return process.env.TRON_SHASTA_FULL_HOST?.trim() || 'https://api.shasta.trongrid.io';
    }
    return this.systemConfigService.getEffectiveString('TRON_MAINNET_FULL_HOST');
  }

  private async buildTronWebWithPrivateKey(chain: string, privateKey: string): Promise<TronWeb> {
    const fullHost = await this.resolveTronFullHost(chain);
    return new TronWeb({ fullHost, privateKey });
  }

  private assertSupportedChain(chain: string): SupportedTreasuryChain {
    if (!(BLOCKCHAIN_CHAIN_DB_VALUES as readonly string[]).includes(chain)) {
      throw new BadRequestException('Unsupported treasury chain', 'TREASURY_CHAIN_UNSUPPORTED', {
        chain,
      });
    }
    return chain as SupportedTreasuryChain;
  }

  private async generateAccount(
    chain: SupportedTreasuryChain,
  ): Promise<{ address: string; privateKey: string }> {
    if (chain === 'SOLANA_MAINNET' || chain === 'SOLANA_DEVNET') {
      // Offload Ed25519 key generation to worker thread
      return this.workerPool.run<
        { type: 'solana'; data: { chain: string } },
        { address: string; privateKey: string }
      >({ type: 'solana', data: { chain } });
    }

    if (getEvmDefinitionByTreasuryChain(chain)) {
      // Offload ECDSA/secp256k1 key generation to worker thread
      return this.workerPool.run<
        { type: 'evm'; data: { chain: string } },
        { address: string; privateKey: string }
      >({ type: 'evm', data: { chain } });
    }

    // Tron: async HTTP call — keep on main thread
    const account = await TronWeb.createAccount();
    return {
      address: account.address.base58,
      privateKey: account.privateKey,
    };
  }

  private async buildSolanaConnection(
    chain: 'SOLANA_MAINNET' | 'SOLANA_DEVNET',
  ): Promise<Connection> {
    if (chain === 'SOLANA_DEVNET') {
      const v = await this.systemConfigService.get<string>('SOLANA_DEVNET_URL');
      const url =
        v?.trim() || process.env.SOLANA_DEVNET_URL?.trim() || 'https://api.devnet.solana.com';
      return new Connection(url, 'confirmed');
    }
    const url = await this.systemConfigService.getEffectiveString('SOLANA_MAINNET_URL');
    return new Connection(url, 'confirmed');
  }

  private async buildTronReadOnlyClient(chain: string): Promise<TronWeb> {
    const fullHost = await this.resolveTronFullHost(chain);
    return new TronWeb({ fullHost });
  }

  private async assertTronAccountExistsOrThrow(
    tronWeb: TronWeb,
    address: string,
    code: string,
  ): Promise<void> {
    let account: unknown;
    try {
      account = await this.retryTronRead(
        () => tronWeb.trx.getAccount(address),
        `TRON account lookup ${address}`,
      );
    } catch (error) {
      throw new ServiceUnavailableException(
        'TRON account lookup is temporarily unavailable. Retry the operation later.',
        'TRON_ACCOUNT_PREFLIGHT_UNAVAILABLE',
        { address, cause: (error as Error).message },
      );
    }

    if (account == null || (typeof account === 'object' && Object.keys(account).length === 0)) {
      throw new BusinessException(
        'Destination Tron account is not activated yet. Fund TRX or activate the address before sending USDT.',
        code,
      );
    }
  }

  private getFallbackSymbolForChain(chain: SupportedTreasuryChain): string {
    const evmDef = getEvmDefinitionByTreasuryChain(chain);
    if (evmDef) return evmDef.nativeSymbol;
    if (chain === 'SOLANA_MAINNET' || chain === 'SOLANA_DEVNET') return 'SOL';
    if (chain === 'TRON_MAINNET' || chain === 'TRON_NILE' || chain === 'TRON_SHASTA') {
      return 'TRX';
    }
    return '';
  }

  private async retryTronRead<T>(
    operation: () => Promise<T>,
    label: string,
    attempts = 3,
  ): Promise<T> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        const isRateLimited = this.isTronRateLimitError(error);
        if (!isRateLimited || attempt === attempts) {
          throw error;
        }
        this.logger.warn(`TRON RPC rate limited for ${label}; retrying (${attempt}/${attempts})`);
        await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
      }
    }
    throw lastError instanceof Error ? lastError : new Error(`TRON RPC failed for ${label}`);
  }

  private isTronRateLimitError(error: unknown): boolean {
    const message = (error as Error)?.message ?? '';
    return message.includes('status code 429') || message.includes('Too Many Requests');
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

async function mapWithConcurrency<T, U>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<U>,
): Promise<U[]> {
  const results = new Array<U>(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(concurrency, items.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      if (currentIndex >= items.length) return;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  });
  await Promise.all(workers);
  return results;
}
