import { InjectQueue } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bull';
import { DataSource } from 'typeorm';
import { ethers, JsonRpcProvider } from 'ethers';
import { TronWeb } from 'tronweb';
import Decimal from 'decimal.js';
import { uuidv7 } from 'uuidv7';
import {
  BadRequestException,
  BusinessException,
  NotFoundException,
} from '@/common/exceptions';
import { RedisService } from '@/common/services';
import { OnchainTransaction } from '@/entities/onchain-transaction.entity';
import { TreasuryOperation } from '@/entities/treasury-operation.entity';
import { TransactionWallet } from '@/entities/transaction-wallet.entity';
import {
  FundWalletDto,
  ListTreasuryOperationsDto,
  ListTreasuryTransactionsDto,
} from './dto';
import {
  TREASURY_EVENTS_CHANNEL,
  TREASURY_FUND_JOB,
  TREASURY_QUEUE,
  TREASURY_SWEEP_JOB,
} from './constants';
import { TransactionWalletService } from './transaction-wallet.service';

type SupportedTreasuryChain = 'ETH_SEPOLIA' | 'TRON_NILE' | 'TRON_SHASTA';
type TreasuryOperationType = 'SWEEP' | 'FUND';

interface TreasuryJobData {
  operationId: string;
}

@Injectable()
export class TreasuryOperationsService {
  private readonly logger = new Logger(TreasuryOperationsService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly redisService: RedisService,
    private readonly transactionWalletService: TransactionWalletService,
    private readonly configService: ConfigService,
    @InjectQueue(TREASURY_QUEUE) private readonly treasuryQueue: Queue,
  ) {}

  async enqueueSweep(walletId: string, actorUserId: string): Promise<{ operationId: string; status: string }> {
    const wallet = await this.transactionWalletService.getWalletById(walletId);
    if (!wallet.is_active) {
      throw new BadRequestException('Transaction wallet is inactive', 'TREASURY_WALLET_INACTIVE');
    }

    const operation = await this.createOperation({
      type: 'SWEEP',
      chain: wallet.chain,
      fromWalletId: wallet.wallet_id,
      toWalletId: null,
      amount: '0',
      actorUserId,
    });

    await this.treasuryQueue.add(
      TREASURY_SWEEP_JOB,
      { operationId: operation.operation_id } satisfies TreasuryJobData,
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: true,
      },
    );

    return { operationId: operation.operation_id, status: operation.status };
  }

  async enqueueFund(
    walletId: string,
    dto: FundWalletDto,
    actorUserId: string,
  ): Promise<{ operationId: string; status: string }> {
    const wallet = await this.transactionWalletService.getWalletById(walletId);
    if (!wallet.is_active) {
      throw new BadRequestException('Transaction wallet is inactive', 'TREASURY_WALLET_INACTIVE');
    }

    const amount = this.normalizePositiveAmount(dto.amount);

    const operation = await this.createOperation({
      type: 'FUND',
      chain: wallet.chain,
      fromWalletId: null,
      toWalletId: wallet.wallet_id,
      amount,
      actorUserId,
    });

    await this.treasuryQueue.add(
      TREASURY_FUND_JOB,
      { operationId: operation.operation_id } satisfies TreasuryJobData,
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: true,
      },
    );

    return { operationId: operation.operation_id, status: operation.status };
  }

  async processSweepJob(data: TreasuryJobData): Promise<void> {
    const operation = await this.getOperationForProcessing(data.operationId, 'SWEEP');
    if (!operation.from_wallet_id) {
      throw new BusinessException('Sweep operation missing source wallet', 'TREASURY_SWEEP_MISSING_SOURCE');
    }

    const lockKey = `treasury:lock:${operation.from_wallet_id}`;
    await this.withWalletLock(lockKey, async () => {
      await this.markProcessing(operation.operation_id);
      const wallet = await this.transactionWalletService.getWalletById(operation.from_wallet_id!);
      const mainAddress = await this.transactionWalletService.getMainWalletAddress(wallet.chain);

      const result = await this.sendSweepFromWallet(wallet, mainAddress);
      await this.finalizeSuccess(operation, wallet.address, mainAddress, result.txHash, result.amount);
      await this.publishEvent('operation.completed', {
        operationId: operation.operation_id,
        type: operation.type,
        chain: operation.chain,
        txHash: result.txHash,
        amount: result.amount,
      });
    });
  }

  async processFundJob(data: TreasuryJobData): Promise<void> {
    const operation = await this.getOperationForProcessing(data.operationId, 'FUND');
    if (!operation.to_wallet_id) {
      throw new BusinessException('Fund operation missing destination wallet', 'TREASURY_FUND_MISSING_DESTINATION');
    }

    const lockKey = `treasury:lock:${operation.to_wallet_id}`;
    await this.withWalletLock(lockKey, async () => {
      await this.markProcessing(operation.operation_id);
      const wallet = await this.transactionWalletService.getWalletById(operation.to_wallet_id!);
      const amount = this.normalizePositiveAmount(operation.amount);
      const mainAddress = await this.transactionWalletService.getMainWalletAddress(wallet.chain);

      const txHash = await this.sendFundFromMain(wallet.chain, wallet.address, amount);
      await this.finalizeSuccess(operation, mainAddress, wallet.address, txHash, amount);
      await this.publishEvent('operation.completed', {
        operationId: operation.operation_id,
        type: operation.type,
        chain: operation.chain,
        txHash,
        amount,
      });
    });
  }

  async markFailed(operationId: string, reason: string): Promise<void> {
    await this.dataSource.getRepository(TreasuryOperation).update(
      { operation_id: operationId },
      {
        status: 'FAILED',
        failure_reason: reason.slice(0, 512),
        completed_at: new Date(),
      },
    );

    await this.publishEvent('operation.failed', {
      operationId,
      reason,
    });
  }

  async listOperations(filter: ListTreasuryOperationsDto): Promise<{
    items: TreasuryOperation[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;
    const offset = (page - 1) * limit;

    const qb = this.dataSource
      .getRepository(TreasuryOperation)
      .createQueryBuilder('op')
      .leftJoinAndSelect('op.from_wallet', 'from_wallet')
      .leftJoinAndSelect('op.to_wallet', 'to_wallet')
      .orderBy('op.created_at', 'DESC')
      .skip(offset)
      .take(limit);

    if (filter.chain) qb.andWhere('op.chain = :chain', { chain: filter.chain });
    if (filter.type) qb.andWhere('op.type = :type', { type: filter.type });
    if (filter.status) qb.andWhere('op.status = :status', { status: filter.status });
    if (filter.q) {
      qb.andWhere('(op.tx_hash LIKE :q OR op.operation_id LIKE :q)', { q: `%${filter.q}%` });
    }

    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, limit };
  }

  async getOperation(operationId: string): Promise<TreasuryOperation> {
    const operation = await this.dataSource.getRepository(TreasuryOperation).findOne({
      where: { operation_id: operationId },
      relations: ['from_wallet', 'to_wallet'],
    });

    if (!operation) {
      throw new NotFoundException('Treasury operation', operationId);
    }

    return operation;
  }

  async listTreasuryTransactions(filter: ListTreasuryTransactionsDto): Promise<{
    items: OnchainTransaction[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;
    const offset = (page - 1) * limit;

    const qb = this.dataSource
      .getRepository(OnchainTransaction)
      .createQueryBuilder('tx')
      .where('tx.type IN (:...types)', { types: ['SWEEP', 'FUND'] })
      .orderBy('tx.created_at', 'DESC')
      .skip(offset)
      .take(limit);

    if (filter.chain) qb.andWhere('tx.chain = :chain', { chain: filter.chain });
    if (filter.type) qb.andWhere('tx.type = :type', { type: filter.type });
    if (filter.status) qb.andWhere('tx.status = :status', { status: filter.status });
    if (filter.q) {
      qb.andWhere('(tx.tx_hash LIKE :q OR tx.tx_id LIKE :q OR tx.from_address LIKE :q OR tx.to_address LIKE :q)', {
        q: `%${filter.q}%`,
      });
    }

    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, limit };
  }

  private async createOperation(params: {
    type: TreasuryOperationType;
    chain: SupportedTreasuryChain;
    fromWalletId: string | null;
    toWalletId: string | null;
    amount: string;
    actorUserId: string;
  }): Promise<TreasuryOperation> {
    const repo = this.dataSource.getRepository(TreasuryOperation);
    const operation = repo.create({
      operation_id: uuidv7(),
      type: params.type,
      chain: params.chain,
      from_wallet_id: params.fromWalletId,
      to_wallet_id: params.toWalletId,
      amount: params.amount,
      tx_hash: null,
      onchain_tx_id: null,
      status: 'PENDING',
      actor_user_id: params.actorUserId,
      failure_reason: null,
      completed_at: null,
    });

    return repo.save(operation);
  }

  private async getOperationForProcessing(
    operationId: string,
    expectedType: TreasuryOperationType,
  ): Promise<TreasuryOperation> {
    const operation = await this.dataSource.getRepository(TreasuryOperation).findOne({
      where: { operation_id: operationId },
    });

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
    await this.dataSource.getRepository(TreasuryOperation).update(
      { operation_id: operationId },
      {
        status: 'PROCESSING',
        failure_reason: null,
      },
    );
  }

  private async finalizeSuccess(
    operation: TreasuryOperation,
    fromAddress: string,
    toAddress: string,
    txHash: string,
    amount: string,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const onchainRepo = manager.getRepository(OnchainTransaction);
      const opRepo = manager.getRepository(TreasuryOperation);

      const txId = uuidv7();
      await onchainRepo.save({
        tx_id: txId,
        user_id: operation.actor_user_id,
        linked_wallet_id: null,
        treasury_operation_id: operation.operation_id,
        chain: operation.chain,
        type: operation.type,
        tx_hash: txHash,
        from_address: fromAddress,
        to_address: toAddress,
        amount,
        confirmations: 0,
        status: 'PENDING',
        confirmed_at: null,
        credited_currency_id: null,
        credited_amount: null,
        conversion_rate: null,
      });

      await opRepo.update(
        { operation_id: operation.operation_id },
        {
          status: 'COMPLETED',
          amount,
          tx_hash: txHash,
          onchain_tx_id: txId,
          completed_at: new Date(),
          failure_reason: null,
        },
      );
    });

    this.logger.log(
      `Treasury ${operation.type} completed: operation=${operation.operation_id}, txHash=${txHash}`,
    );
  }

  private async sendSweepFromWallet(
    wallet: TransactionWallet,
    mainAddress: string,
  ): Promise<{ txHash: string; amount: string }> {
    const privateKey = this.transactionWalletService.decryptWalletPrivateKey(wallet);

    if (wallet.chain === 'ETH_SEPOLIA') {
      const provider = this.buildEthereumProvider();
      const signer = new ethers.Wallet(privateKey, provider);
      const balanceWei = await provider.getBalance(wallet.address);
      const feeData = await provider.getFeeData();
      const gasPrice = feeData.gasPrice ?? ethers.parseUnits('2', 'gwei');
      const gasFee = gasPrice * 21000n;

      if (balanceWei <= gasFee) {
        throw new BusinessException('Insufficient ETH balance to sweep after gas fee', 'TREASURY_SWEEP_INSUFFICIENT_BALANCE');
      }

      const value = balanceWei - gasFee;
      const tx = await signer.sendTransaction({ to: mainAddress, value });
      return {
        txHash: tx.hash,
        amount: ethers.formatEther(value),
      };
    }

    const tronWeb = this.buildTronSigner(wallet.chain, privateKey);
    const balanceSun = await tronWeb.trx.getBalance(wallet.address);
    const reserveSun = 100_000; // Keep 0.1 TRX for fees/bandwidth.
    const transferSun = Math.max(0, balanceSun - reserveSun);
    if (transferSun <= 0) {
      throw new BusinessException('Insufficient TRX balance to sweep', 'TREASURY_SWEEP_INSUFFICIENT_BALANCE');
    }

    const tx = await tronWeb.trx.sendTransaction(mainAddress, transferSun);
    if (!tx?.result || !tx?.txid) {
      throw new BusinessException('Failed to submit TRON sweep transaction', 'TREASURY_SWEEP_SEND_FAILED');
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

    if (chain === 'ETH_SEPOLIA') {
      const provider = this.buildEthereumProvider();
      const signer = new ethers.Wallet(privateKey, provider);
      const tx = await signer.sendTransaction({
        to: toAddress,
        value: ethers.parseEther(amount),
      });
      return tx.hash;
    }

    const tronWeb = this.buildTronSigner(chain, privateKey);
    const sun = Math.floor(new Decimal(amount).mul(1_000_000).toNumber());
    const tx = await tronWeb.trx.sendTransaction(toAddress, sun);
    if (!tx?.result || !tx?.txid) {
      throw new BusinessException('Failed to submit TRON fund transaction', 'TREASURY_FUND_SEND_FAILED');
    }
    return tx.txid;
  }

  private async withWalletLock(lockKey: string, fn: () => Promise<void>): Promise<void> {
    const token = uuidv7();
    const client = this.redisService.getClient();
    const lock = await client.set(lockKey, token, 'EX', 120, 'NX');

    if (lock !== 'OK') {
      throw new BusinessException('Another treasury operation is running on this wallet', 'TREASURY_WALLET_LOCKED');
    }

    try {
      await fn();
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(String(error));
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

  private buildEthereumProvider(): JsonRpcProvider {
    const rpcUrl =
      this.configService.get<string>('app.blockchain.ethereum.sepoliaRpcUrl') ??
      'https://rpc.sepolia.org';
    return new JsonRpcProvider(rpcUrl);
  }

  private buildTronSigner(chain: 'TRON_NILE' | 'TRON_SHASTA', privateKey: string): TronWeb {
    const fullHost =
      chain === 'TRON_SHASTA'
        ? this.configService.get<string>('app.blockchain.tron.shastaFullHost') ??
          'https://api.shasta.trongrid.io'
        : this.configService.get<string>('app.blockchain.tron.nileFullHost') ??
          'https://nile.trongrid.io';

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
