import { createHash } from 'node:crypto';
import { InjectQueue } from '@nestjs/bull';
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
import type { Job, Queue } from 'bull';
import Decimal from 'decimal.js';
import { ethers } from 'ethers';
import { TronWeb } from 'tronweb';
import { uuidv7 } from 'uuidv7';
import { getEvmDefinitionByTreasuryChain } from '@/common/constants/evm-chain-definitions';
import {
  BadRequestException,
  BusinessException,
  NotFoundException,
  ServiceUnavailableException,
  TreasuryWalletBusyException,
} from '@/common/exceptions';
import { RedisService } from '@/common/services';
import type { BlockchainOnchainTransactionRecord } from '@/modules/blockchain';
import { SystemConfigService } from '@/modules/system-config/system-config.service';
import type { TransactionWalletRecord, TreasuryOperationRecord } from '@/modules/treasury';
import {
  TREASURY_EVENTS_CHANNEL,
  TREASURY_FUND_JOB,
  TREASURY_QUEUE,
  TREASURY_SWEEP_JOB,
} from './constants';
import {
  TREASURY_ONCHAIN_READ_REPOSITORY,
  TREASURY_OPERATION_REPOSITORY,
  type TreasuryOnchainReadRepositoryPort,
  type TreasuryOperationRepositoryPort,
} from './domain/ports';
import type {
  FundWalletDto,
  ListTreasuryOperationsDto,
  ListTreasuryTransactionsDto,
  SweepWalletDto,
} from './dto';
import { TransactionWalletService } from './transaction-wallet.service';
import { jsonRpcProviderForTreasuryEvmChain } from './treasury-evm-json-rpc.helper';
import {
  type SupportedTreasuryChain,
  TreasuryMainWalletService,
} from './treasury-main-wallet.service';

type TreasuryOperationRecordType = 'SWEEP' | 'FUND';

interface TreasuryJobData {
  operationId: string;
  mainWalletId?: string;
}

export type TreasuryEnqueueResult = {
  operationId: string;
  status: string;
  alreadyQueued?: boolean;
};

/** Bull typings omit getJob/getState — runtime provides them. */
type TreasuryJob = Job & { getState(): Promise<string> };
type TreasuryQueue = Queue & { getJob(jobId: string): Promise<TreasuryJob | null> };

/** Wall-clock cap for waiting on the per-wallet Redis lock (not enqueue time — avoids TZ / clock skew). */
const TREASURY_LOCK_WAIT_MAX_MS = 15 * 60 * 1000;

@Injectable()
export class TreasuryOperationsService {
  private readonly logger = new Logger(TreasuryOperationsService.name);

  private static readonly LOCK_WAIT_TIMER_PREFIX = 'treasury:lock-wait-since:';
  /** TTL longer than max wait so the key survives until timeout or successful lock. */
  private static readonly LOCK_WAIT_TIMER_TTL_SEC = 25 * 60;

  constructor(
    private readonly redisService: RedisService,
    private readonly transactionWalletService: TransactionWalletService,
    private readonly treasuryMainWalletService: TreasuryMainWalletService,
    readonly _configService: ConfigService,
    private readonly systemConfigService: SystemConfigService,
    @Inject(TREASURY_OPERATION_REPOSITORY)
    private readonly treasuryOperationRepository: TreasuryOperationRepositoryPort,
    @Inject(TREASURY_ONCHAIN_READ_REPOSITORY)
    private readonly treasuryOnchainReadRepository: TreasuryOnchainReadRepositoryPort,
    @InjectQueue(TREASURY_QUEUE) private readonly treasuryQueue: TreasuryQueue,
  ) {}

  async enqueueSweep(
    walletId: string,
    actorUserId: string,
    dto: SweepWalletDto,
  ): Promise<TreasuryEnqueueResult> {
    const wallet = await this.transactionWalletService.getWalletById(walletId);
    if (!wallet.is_active) {
      throw new BadRequestException('Transaction wallet is inactive', 'TREASURY_WALLET_INACTIVE');
    }

    const asset = dto.asset ?? 'NATIVE';
    if (asset === 'USDT_TRC20' && !TreasuryOperationsService.isTronChain(wallet.chain)) {
      throw new BadRequestException(
        'USDT sweep is only supported on Tron networks',
        'TREASURY_USDT_CHAIN_UNSUPPORTED',
      );
    }

    const jobId = this.buildSweepJobId(wallet.wallet_id, asset, dto.mainWalletId, actorUserId);

    const fromJob = await this.resolveExistingTreasuryJob(jobId);
    if (fromJob) {
      return fromJob;
    }

    const dup = await this.treasuryOperationRepository.findActiveDuplicateOperation({
      type: 'SWEEP',
      walletId: wallet.wallet_id,
      asset,
      amount: '0',
      actorUserId,
    });
    if (dup) {
      return {
        operationId: dup.operation_id,
        status: dup.status,
        alreadyQueued: true,
      };
    }

    return await this.runWithEnqueueLock(jobId, async () => {
      const dup2 = await this.treasuryOperationRepository.findActiveDuplicateOperation({
        type: 'SWEEP',
        walletId: wallet.wallet_id,
        asset,
        amount: '0',
        actorUserId,
      });
      if (dup2) {
        return {
          operationId: dup2.operation_id,
          status: dup2.status,
          alreadyQueued: true,
        };
      }

      const fromJob2 = await this.resolveExistingTreasuryJob(jobId);
      if (fromJob2) {
        return fromJob2;
      }

      const operation = await this.createOperation({
        type: 'SWEEP',
        chain: wallet.chain,
        fromWalletId: wallet.wallet_id,
        toWalletId: null,
        amount: '0',
        asset,
        actorUserId,
      });

      await this.treasuryQueue.add(
        TREASURY_SWEEP_JOB,
        {
          operationId: operation.operation_id,
          mainWalletId: dto.mainWalletId,
        } satisfies TreasuryJobData,
        {
          jobId,
          attempts: 100,
          backoff: { type: 'treasuryDefer', delay: 3_000 },
          removeOnComplete: true,
        },
      );

      return { operationId: operation.operation_id, status: operation.status };
    });
  }

  async enqueueFund(
    walletId: string,
    dto: FundWalletDto,
    actorUserId: string,
  ): Promise<TreasuryEnqueueResult> {
    const wallet = await this.transactionWalletService.getWalletById(walletId);
    if (!wallet.is_active) {
      throw new BadRequestException('Transaction wallet is inactive', 'TREASURY_WALLET_INACTIVE');
    }

    const asset = dto.asset ?? 'NATIVE';
    if (asset === 'USDT_TRC20' && !TreasuryOperationsService.isTronChain(wallet.chain)) {
      throw new BadRequestException(
        'USDT funding is only supported on Tron networks',
        'TREASURY_USDT_CHAIN_UNSUPPORTED',
      );
    }

    const rawAmount = this.normalizePositiveAmount(dto.amount);
    const amount =
      asset === 'USDT_TRC20'
        ? new Decimal(rawAmount).toDecimalPlaces(6, Decimal.ROUND_DOWN).toFixed()
        : rawAmount;

    const jobId = this.buildFundJobId(wallet.wallet_id, asset, amount, actorUserId);

    const fromJob = await this.resolveExistingTreasuryJob(jobId);
    if (fromJob) {
      return fromJob;
    }

    const dup = await this.treasuryOperationRepository.findActiveDuplicateOperation({
      type: 'FUND',
      walletId: wallet.wallet_id,
      asset,
      amount,
      actorUserId,
    });
    if (dup) {
      return {
        operationId: dup.operation_id,
        status: dup.status,
        alreadyQueued: true,
      };
    }

    return await this.runWithEnqueueLock(jobId, async () => {
      const dup2 = await this.treasuryOperationRepository.findActiveDuplicateOperation({
        type: 'FUND',
        walletId: wallet.wallet_id,
        asset,
        amount,
        actorUserId,
      });
      if (dup2) {
        return {
          operationId: dup2.operation_id,
          status: dup2.status,
          alreadyQueued: true,
        };
      }

      const fromJob2 = await this.resolveExistingTreasuryJob(jobId);
      if (fromJob2) {
        return fromJob2;
      }

      const operation = await this.createOperation({
        type: 'FUND',
        chain: wallet.chain,
        fromWalletId: null,
        toWalletId: wallet.wallet_id,
        amount,
        asset,
        actorUserId,
      });

      await this.treasuryQueue.add(
        TREASURY_FUND_JOB,
        { operationId: operation.operation_id } satisfies TreasuryJobData,
        {
          jobId,
          attempts: 100,
          backoff: { type: 'treasuryDefer', delay: 3_000 },
          removeOnComplete: true,
        },
      );

      return { operationId: operation.operation_id, status: operation.status };
    });
  }

  async processSweepJob(data: TreasuryJobData): Promise<void> {
    const operation = await this.getOperationForProcessing(data.operationId, 'SWEEP');
    if (!operation.from_wallet_id) {
      throw new BusinessException(
        'Sweep operation missing source wallet',
        'TREASURY_SWEEP_MISSING_SOURCE',
      );
    }

    const lockKey = `treasury:lock:${operation.from_wallet_id}`;
    const lockToken = await this.tryAcquireWalletLock(lockKey);
    if (!lockToken) {
      const waitStartedAt = await this.startOrGetLockWaitTimer(operation.operation_id);
      if (Date.now() - waitStartedAt > TREASURY_LOCK_WAIT_MAX_MS) {
        await this.clearLockWaitTimer(operation.operation_id);
        throw new BusinessException(
          'Exceeded max wait while another treasury operation was using this wallet',
          'TREASURY_WALLET_BUSY_TIMEOUT',
        );
      }
      throw new TreasuryWalletBusyException({
        operationId: operation.operation_id,
        lockKey,
        createdAt: operation.created_at,
      });
    }

    await this.clearLockWaitTimer(operation.operation_id);

    /** Hold only while broadcasting; balance polls can take 60–90s and must not block other treasury ops on the same wallet. */
    let lockHeld = true;
    try {
      await this.markProcessing(operation.operation_id);
      const wallet = await this.transactionWalletService.getWalletById(operation.from_wallet_id!);
      const mainAddress = await this.treasuryMainWalletService.getMainWalletAddress(
        wallet.chain,
        data.mainWalletId,
      );

      const asset = operation.asset ?? 'NATIVE';
      let usdtBeforeSweep: string | null = null;
      if (TreasuryOperationsService.isTronChain(wallet.chain) && asset === 'USDT_TRC20') {
        usdtBeforeSweep = await this.transactionWalletService.getTronUsdtHumanBalanceOnChain(
          wallet.chain,
          wallet.address,
        );
      }

      const result = await this.sendSweepFromWallet(wallet, mainAddress, asset);

      await this.releaseWalletLock(lockKey, lockToken);
      lockHeld = false;

      if (TreasuryOperationsService.isTronChain(wallet.chain)) {
        if (asset === 'USDT_TRC20' && usdtBeforeSweep != null) {
          const swept = await this.transactionWalletService.waitForTronUsdtBalanceReflectSweep(
            wallet.chain,
            wallet.address,
            usdtBeforeSweep,
          );
          if (!swept) {
            await this.transactionWalletService.invalidateBalanceCache(
              wallet.chain,
              wallet.address,
            );
            throw new BusinessException(
              'USDT sweep did not reduce on-chain balance in time. Check TRX for fees/energy and TronGrid.',
              'TREASURY_SWEEP_USDT_BALANCE_NOT_UPDATED',
            );
          }
        } else if (asset === 'NATIVE') {
          await this.transactionWalletService.waitForTronBalanceReflectSweep(
            wallet.chain,
            wallet.address,
          );
        }
      }
      await this.finalizeSuccess(
        operation,
        wallet.address,
        mainAddress,
        result.txHash,
        result.amount,
      );
      await this.publishEvent('operation.completed', {
        operationId: operation.operation_id,
        type: operation.type,
        chain: operation.chain,
        txHash: result.txHash,
        amount: result.amount,
      });
    } finally {
      if (lockHeld) {
        await this.releaseWalletLock(lockKey, lockToken);
      }
    }
  }

  async processFundJob(data: TreasuryJobData): Promise<void> {
    const operation = await this.getOperationForProcessing(data.operationId, 'FUND');
    if (!operation.to_wallet_id) {
      throw new BusinessException(
        'Fund operation missing destination wallet',
        'TREASURY_FUND_MISSING_DESTINATION',
      );
    }

    const lockKey = `treasury:lock:${operation.to_wallet_id}`;
    const lockToken = await this.tryAcquireWalletLock(lockKey);
    if (!lockToken) {
      const waitStartedAt = await this.startOrGetLockWaitTimer(operation.operation_id);
      if (Date.now() - waitStartedAt > TREASURY_LOCK_WAIT_MAX_MS) {
        await this.clearLockWaitTimer(operation.operation_id);
        throw new BusinessException(
          'Exceeded max wait while another treasury operation was using this wallet',
          'TREASURY_WALLET_BUSY_TIMEOUT',
        );
      }
      throw new TreasuryWalletBusyException({
        operationId: operation.operation_id,
        lockKey,
        createdAt: operation.created_at,
      });
    }

    await this.clearLockWaitTimer(operation.operation_id);

    /** Hold only while broadcasting; balance polls can take 60–90s and must not block other treasury ops on the same wallet. */
    let lockHeld = true;
    try {
      await this.markProcessing(operation.operation_id);
      const wallet = await this.transactionWalletService.getWalletById(operation.to_wallet_id!);
      const amount = this.normalizePositiveAmount(operation.amount);
      const mainAddress = await this.transactionWalletService.getMainWalletAddress(wallet.chain);
      const asset = operation.asset ?? 'NATIVE';

      let tronPreFundSun: number | null = null;
      let tronPreUsdtHuman: string | null = null;
      if (TreasuryOperationsService.isTronChain(wallet.chain)) {
        if (asset === 'USDT_TRC20') {
          tronPreUsdtHuman = await this.transactionWalletService.getTronUsdtHumanBalanceOnChain(
            wallet.chain,
            wallet.address,
          );
        } else {
          tronPreFundSun = await this.transactionWalletService.getTronNativeBalanceSun(
            wallet.chain,
            wallet.address,
          );
        }
      }

      let txHash: string;
      if (asset === 'USDT_TRC20' && TreasuryOperationsService.isTronChain(wallet.chain)) {
        txHash = await this.sendFundUsdtFromMain(wallet.chain, wallet.address, amount);
      } else {
        txHash = await this.sendFundFromMain(wallet.chain, wallet.address, amount);
      }

      await this.releaseWalletLock(lockKey, lockToken);
      lockHeld = false;

      if (asset === 'USDT_TRC20' && TreasuryOperationsService.isTronChain(wallet.chain)) {
        const funded = await this.transactionWalletService.waitForTronUsdtBalanceReflectFund(
          wallet.chain,
          wallet.address,
          tronPreUsdtHuman ?? '0',
        );
        if (!funded) {
          await this.transactionWalletService.invalidateBalanceCache(wallet.chain, wallet.address);
          throw new BusinessException(
            'USDT funding did not increase destination balance in time. Ensure the main wallet has enough USDT and TRX (bandwidth/energy), then retry.',
            'TREASURY_FUND_USDT_BALANCE_NOT_UPDATED',
          );
        }
      } else if (tronPreFundSun !== null && TreasuryOperationsService.isTronChain(wallet.chain)) {
        await this.transactionWalletService.waitForTronBalanceReflectFund(
          wallet.chain,
          wallet.address,
          tronPreFundSun,
        );
      }

      await this.finalizeSuccess(operation, mainAddress, wallet.address, txHash, amount);
      await this.publishEvent('operation.completed', {
        operationId: operation.operation_id,
        type: operation.type,
        chain: operation.chain,
        txHash,
        amount,
      });
    } finally {
      if (lockHeld) {
        await this.releaseWalletLock(lockKey, lockToken);
      }
    }
  }

  async markFailed(operationId: string, reason: string): Promise<void> {
    await this.treasuryOperationRepository.updateByOperationId(operationId, {
      status: 'FAILED',
      failure_reason: reason.slice(0, 512),
      completed_at: new Date(),
    });

    await this.publishEvent('operation.failed', {
      operationId,
      reason,
    });
  }

  async listOperations(filter: ListTreasuryOperationsDto): Promise<{
    items: TreasuryOperationRecord[];
    total: number;
    page: number;
    limit: number;
  }> {
    return this.treasuryOperationRepository.listWithFilters(filter);
  }

  async getOperation(operationId: string): Promise<TreasuryOperationRecord> {
    const operation =
      await this.treasuryOperationRepository.findByOperationIdWithWallets(operationId);

    if (!operation) {
      throw new NotFoundException('Treasury operation', operationId);
    }

    return operation;
  }

  async listTreasuryTransactions(filter: ListTreasuryTransactionsDto): Promise<{
    items: BlockchainOnchainTransactionRecord[];
    total: number;
    page: number;
    limit: number;
  }> {
    return this.treasuryOnchainReadRepository.listFundSweepTransactions(filter);
  }

  private async createOperation(params: {
    type: TreasuryOperationRecordType;
    chain: SupportedTreasuryChain;
    fromWalletId: string | null;
    toWalletId: string | null;
    amount: string;
    actorUserId: string;
    asset?: 'NATIVE' | 'USDT_TRC20';
  }): Promise<TreasuryOperationRecord> {
    return this.treasuryOperationRepository.createPendingOperation(params);
  }

  private async getOperationForProcessing(
    operationId: string,
    expectedType: TreasuryOperationRecordType,
  ): Promise<TreasuryOperationRecord> {
    const operation = await this.treasuryOperationRepository.findByOperationId(operationId);

    if (!operation) {
      throw new NotFoundException('Treasury operation', operationId);
    }

    if (operation.type !== expectedType) {
      throw new BusinessException(
        `Job type mismatch for operation ${operationId}`,
        'TREASURY_JOB_TYPE_MISMATCH',
      );
    }

    if (operation.status !== 'PENDING' && operation.status !== 'PROCESSING') {
      throw new BusinessException(
        `Operation ${operationId} is not processable in status ${operation.status}`,
        'TREASURY_OPERATION_INVALID_STATUS',
      );
    }

    return operation;
  }

  private async markProcessing(operationId: string): Promise<void> {
    await this.treasuryOperationRepository.updateByOperationId(operationId, {
      status: 'PROCESSING',
      failure_reason: null,
    });
  }

  private async finalizeSuccess(
    operation: TreasuryOperationRecord,
    fromAddress: string,
    toAddress: string,
    txHash: string,
    amount: string,
  ): Promise<void> {
    await this.treasuryOperationRepository.finalizeSuccessWithOnchainTx({
      operation,
      fromAddress,
      toAddress,
      txHash,
      amount,
    });

    this.logger.log(
      `Treasury ${operation.type} completed: operation=${operation.operation_id}, txHash=${txHash}`,
    );

    await this.transactionWalletService.invalidateAllTreasuryBalanceCaches();
  }

  private async sendFundUsdtFromMain(
    chain: 'TRON_MAINNET' | 'TRON_NILE' | 'TRON_SHASTA',
    toAddress: string,
    amount: string,
  ): Promise<string> {
    const pk = await this.transactionWalletService.resolveMainWalletPrivateKey(chain);
    return this.transactionWalletService.transferTronUsdtFromPrivateKey(
      chain,
      pk,
      toAddress,
      amount,
    );
  }

  private async sendSweepFromWallet(
    wallet: TransactionWalletRecord,
    mainAddress: string,
    asset: 'NATIVE' | 'USDT_TRC20' = 'NATIVE',
  ): Promise<{ txHash: string; amount: string }> {
    if (asset === 'USDT_TRC20') {
      if (!TreasuryOperationsService.isTronChain(wallet.chain)) {
        throw new BusinessException('USDT sweep requires a Tron chain', 'TREASURY_USDT_CHAIN');
      }
      return this.transactionWalletService.sweepAllTronUsdtFromWallet(wallet, mainAddress);
    }

    const privateKey = this.transactionWalletService.decryptWalletPrivateKey(wallet);

    const evmSweepDef = getEvmDefinitionByTreasuryChain(wallet.chain);
    if (evmSweepDef) {
      const provider = await jsonRpcProviderForTreasuryEvmChain(
        wallet.chain,
        this.systemConfigService,
      );
      const signer = new ethers.Wallet(privateKey, provider);
      const balanceWei = await provider.getBalance(wallet.address);
      const feeData = await provider.getFeeData();
      const gasPrice = feeData.gasPrice ?? ethers.parseUnits('2', 'gwei');
      const gasFee = gasPrice * 21000n;
      const nativeLabel = evmSweepDef.nativeSymbol;

      if (balanceWei <= gasFee) {
        throw new BusinessException(
          `Insufficient ${nativeLabel} balance to sweep after gas fee`,
          'TREASURY_SWEEP_INSUFFICIENT_BALANCE',
        );
      }

      const value = balanceWei - gasFee;
      const tx = await signer.sendTransaction({ to: mainAddress, value });
      const receipt = await tx.wait(1, 120_000);
      if (!receipt || receipt.status !== 1) {
        throw new BusinessException(
          `${nativeLabel} sweep transaction was not confirmed successfully`,
          'TREASURY_SWEEP_CHAIN_FAILED',
        );
      }
      return {
        txHash: receipt.hash,
        amount: ethers.formatEther(value),
      };
    }

    if (wallet.chain === 'SOLANA_MAINNET' || wallet.chain === 'SOLANA_DEVNET') {
      const connection = await this.buildSolanaConnection(wallet.chain);
      const decodedKey = bs58.decode(privateKey);
      const keypair = Keypair.fromSecretKey(decodedKey);

      const balanceLamports = await connection.getBalance(keypair.publicKey);
      const reserveLamports = 5000; // standard solana fee
      const transferLamports = Math.max(0, balanceLamports - reserveLamports);

      if (transferLamports <= 0) {
        throw new BusinessException(
          'Insufficient SOL balance to sweep',
          'TREASURY_SWEEP_INSUFFICIENT_BALANCE',
        );
      }

      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: keypair.publicKey,
          toPubkey: new PublicKey(mainAddress),
          lamports: transferLamports,
        }),
      );

      const txHash = await sendAndConfirmTransaction(connection, tx, [keypair]);

      return {
        txHash,
        amount: new Decimal(transferLamports).div(1_000_000_000).toString(),
      };
    }

    const tronWeb = await this.buildTronSigner(wallet.chain, privateKey);
    const balanceSun = await tronWeb.trx.getBalance(wallet.address);
    const reserveSun = 100_000; // Keep 0.1 TRX for fees/bandwidth.
    const transferSun = Math.max(0, balanceSun - reserveSun);
    if (transferSun <= 0) {
      throw new BusinessException(
        'Insufficient TRX balance to sweep',
        'TREASURY_SWEEP_INSUFFICIENT_BALANCE',
      );
    }

    const tx = await tronWeb.trx.sendTransaction(mainAddress, transferSun);
    if (!tx?.result || !tx?.txid) {
      throw new BusinessException(
        'Failed to submit TRON sweep transaction',
        'TREASURY_SWEEP_SEND_FAILED',
      );
    }

    return {
      txHash: tx.txid,
      amount: new Decimal(transferSun).div(1_000_000).toString(),
    };
  }

  private async sendFundFromMain(
    chain: SupportedTreasuryChain,
    toAddress: string,
    amount: string,
  ): Promise<string> {
    const privateKey = await this.transactionWalletService.resolveMainWalletPrivateKey(chain);

    if (getEvmDefinitionByTreasuryChain(chain)) {
      const provider = await jsonRpcProviderForTreasuryEvmChain(chain, this.systemConfigService);
      const signer = new ethers.Wallet(privateKey, provider);
      const tx = await signer.sendTransaction({
        to: toAddress,
        value: ethers.parseEther(amount),
      });
      return tx.hash;
    }

    if (chain === 'SOLANA_MAINNET' || chain === 'SOLANA_DEVNET') {
      const connection = await this.buildSolanaConnection(chain);
      const decodedKey = bs58.decode(privateKey);
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
      return txHash;
    }

    const tronWeb = await this.buildTronSigner(chain, privateKey);
    const sun = Math.floor(new Decimal(amount).mul(1_000_000).toNumber());
    const tx = await tronWeb.trx.sendTransaction(toAddress, sun);
    if (!tx?.result || !tx?.txid) {
      throw new BusinessException(
        'Failed to submit TRON fund transaction',
        'TREASURY_FUND_SEND_FAILED',
      );
    }
    return tx.txid;
  }

  /**
   * First time this operation hits lock contention, records `Date.now()` in Redis; later retries read it.
   * Avoids using DB `created_at` (timezone / driver skew vs `Date.now()` caused false 15-minute timeouts).
   */
  private async startOrGetLockWaitTimer(operationId: string): Promise<number> {
    const client = this.redisService.getClient();
    const key = `${TreasuryOperationsService.LOCK_WAIT_TIMER_PREFIX}${operationId}`;
    const now = Date.now();
    const setOk = await client.set(
      key,
      String(now),
      'EX',
      TreasuryOperationsService.LOCK_WAIT_TIMER_TTL_SEC,
      'NX',
    );
    if (setOk === 'OK') {
      return now;
    }
    const raw = await client.get(key);
    const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
    return Number.isFinite(parsed) ? parsed : now;
  }

  private async clearLockWaitTimer(operationId: string): Promise<void> {
    await this.redisService
      .getClient()
      .del(`${TreasuryOperationsService.LOCK_WAIT_TIMER_PREFIX}${operationId}`);
  }

  private async tryAcquireWalletLock(lockKey: string): Promise<string | null> {
    const token = uuidv7();
    const client = this.redisService.getClient();
    const lock = await client.set(lockKey, token, 'EX', 120, 'NX');
    return lock === 'OK' ? token : null;
  }

  private async releaseWalletLock(lockKey: string, token: string): Promise<void> {
    const client = this.redisService.getClient();
    await client.eval(
      'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end',
      1,
      lockKey,
      token,
    );
  }

  private buildFundJobId(
    walletId: string,
    asset: string,
    amount: string,
    actorUserId: string,
  ): string {
    const h = createHash('sha256').update(`${amount}|${actorUserId}`).digest('hex').slice(0, 16);
    return `treasury-fund:${walletId}:${asset}:${h}`;
  }

  private buildSweepJobId(
    walletId: string,
    asset: string,
    mainWalletId: string | undefined,
    actorUserId: string,
  ): string {
    const main = mainWalletId ?? 'default';
    const h = createHash('sha256').update(actorUserId).digest('hex').slice(0, 12);
    return `treasury-sweep:${walletId}:${asset}:${main}:${h}`;
  }

  private async resolveExistingTreasuryJob(jobId: string): Promise<TreasuryEnqueueResult | null> {
    try {
      const existing = await this.treasuryQueue.getJob(jobId);
      if (!existing) {
        return null;
      }
      const state = await existing.getState();
      if (state === 'completed' || state === 'failed') {
        return null;
      }
      const data = existing.data as TreasuryJobData;
      const op = await this.treasuryOperationRepository.findByOperationId(data.operationId);
      if (op && (op.status === 'PENDING' || op.status === 'PROCESSING')) {
        return {
          operationId: op.operation_id,
          status: op.status,
          alreadyQueued: true,
        };
      }
    } catch {
      /* ignore queue read errors */
    }
    return null;
  }

  private async runWithEnqueueLock<T>(jobId: string, fn: () => Promise<T>): Promise<T> {
    const client = this.redisService.getClient();
    const lockKey = `treasury:enqueue-lock:${jobId}`;
    const token = uuidv7();
    let acquired = await client.set(lockKey, token, 'EX', 30, 'NX');
    let spins = 0;
    while (acquired !== 'OK' && spins < 40) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      spins++;
      acquired = await client.set(lockKey, token, 'EX', 30, 'NX');
    }
    if (acquired !== 'OK') {
      throw new ServiceUnavailableException(
        'Treasury enqueue is temporarily contended; please retry',
        'TREASURY_ENQUEUE_LOCK_BUSY',
      );
    }
    try {
      return await fn();
    } finally {
      await client.eval(
        'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end',
        1,
        lockKey,
        token,
      );
    }
  }

  private normalizePositiveAmount(amount: string): string {
    const value = new Decimal(amount);
    if (!value.isFinite() || value.lte(0)) {
      throw new BadRequestException('Amount must be greater than zero', 'TREASURY_INVALID_AMOUNT');
    }
    return value.toFixed();
  }

  private static isTronChain(chain: string): chain is 'TRON_MAINNET' | 'TRON_NILE' | 'TRON_SHASTA' {
    return chain === 'TRON_MAINNET' || chain === 'TRON_NILE' || chain === 'TRON_SHASTA';
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

  private async buildTronSigner(chain: string, privateKey: string): Promise<TronWeb> {
    const fullHost = await this.resolveTronFullHost(chain);
    return new TronWeb({ fullHost, privateKey });
  }

  private async publishEvent(event: string, payload: Record<string, unknown>): Promise<void> {
    try {
      await this.redisService.publish(
        TREASURY_EVENTS_CHANNEL,
        JSON.stringify({ event, payload, timestamp: new Date().toISOString() }),
      );
    } catch (error) {
      this.logger.warn(`Failed to publish treasury event ${event}: ${(error as Error).message}`);
    }
  }
}
