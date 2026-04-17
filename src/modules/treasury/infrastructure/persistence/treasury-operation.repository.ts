import { Injectable } from '@nestjs/common';
import { DataSource, In, type QueryDeepPartialEntity } from 'typeorm';
import { uuidv7 } from 'uuidv7';
import { OnchainTxStatus } from '@/common/enums';
import { calcSkip } from '@/common/utils/pagination.util';
import { TreasuryOperation } from '@/entities/treasury-operation.entity';
import { OnchainTransaction } from '@/modules/blockchain';
import type { TreasuryMainWalletChain } from '@/modules/treasury';
import type { TreasuryOperationRepositoryPort } from '../../domain/ports';
import type { ListTreasuryOperationsDto } from '../../dto';

type TreasuryOperationType = 'SWEEP' | 'FUND';

@Injectable()
export class TreasuryOperationRepository implements TreasuryOperationRepositoryPort {
  constructor(private readonly dataSource: DataSource) {}

  async createPendingOperation(params: {
    type: TreasuryOperationType;
    chain: TreasuryMainWalletChain;
    fromWalletId: string | null;
    toWalletId: string | null;
    amount: string;
    asset?: 'NATIVE' | 'USDT_TRC20';
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
      asset: params.asset ?? 'NATIVE',
      tx_hash: null,
      onchain_tx_id: null,
      status: 'PENDING',
      actor_user_id: params.actorUserId,
      failure_reason: null,
      completed_at: null,
    });
    return repo.save(operation);
  }

  async findByOperationIdWithWallets(operationId: string): Promise<TreasuryOperation | null> {
    return this.dataSource.getRepository(TreasuryOperation).findOne({
      where: { operation_id: operationId },
      relations: ['from_wallet', 'to_wallet'],
    });
  }

  async findByOperationId(operationId: string): Promise<TreasuryOperation | null> {
    return this.dataSource.getRepository(TreasuryOperation).findOne({
      where: { operation_id: operationId },
    });
  }

  /** Count Fund/Sweep rows still in-flight for this transaction wallet (either side). */
  async countNonTerminalForWallet(walletId: string): Promise<number> {
    const active = ['PENDING', 'PROCESSING'] as const;
    return this.dataSource.getRepository(TreasuryOperation).count({
      where: [
        { from_wallet_id: walletId, status: In([...active]) },
        { to_wallet_id: walletId, status: In([...active]) },
      ],
    });
  }

  async updateByOperationId(
    operationId: string,
    partial: QueryDeepPartialEntity<TreasuryOperation>,
  ): Promise<void> {
    await this.dataSource
      .getRepository(TreasuryOperation)
      .update({ operation_id: operationId }, partial);
  }

  async listWithFilters(filter: ListTreasuryOperationsDto): Promise<{
    items: TreasuryOperation[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;
    const offset = calcSkip(page, limit);

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

  /**
   * Atomic persist: new on-chain row + operation completed fields (treasury Fund/Sweep success path).
   */
  async finalizeSuccessWithOnchainTx(params: {
    operation: TreasuryOperation;
    fromAddress: string;
    toAddress: string;
    txHash: string;
    amount: string;
  }): Promise<void> {
    const { operation, fromAddress, toAddress, txHash, amount } = params;
    await this.dataSource.transaction(async (manager) => {
      const onchainRepo = manager.getRepository(OnchainTransaction);
      const opRepo = manager.getRepository(TreasuryOperation);

      const txId = uuidv7();
      const now = new Date();
      await onchainRepo.save({
        tx_id: txId,
        user_id: operation.actor_user_id,
        linked_wallet_id: null,
        treasury_operation_id: operation.operation_id,
        chain: operation.chain,
        type: operation.type,
        tx_hash: txHash,
        log_index: 0,
        from_address: fromAddress,
        to_address: toAddress,
        amount,
        /** Broadcast + balance wait already succeeded before this row is written. */
        confirmations: 1,
        status: OnchainTxStatus.COMPLETED,
        confirmed_at: now,
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
  }
}
