import { Injectable } from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import { calcSkip } from '@/common/utils/pagination.util';
import { TreasuryOperation } from '@/entities/treasury-operation.entity';
import type { BlockchainOnchainTransactionRecord } from '@/modules/blockchain';
import { OnchainTransaction } from '@/modules/blockchain';
import type { TreasuryOnchainReadRepositoryPort } from '../../domain/ports';
import type { ListTreasuryTransactionsDto } from '../../dto';

function mapOnchainToTreasuryHistoryRecord(
  tx: OnchainTransaction,
  asset: 'NATIVE' | 'USDT_TRC20' | null,
): BlockchainOnchainTransactionRecord {
  return {
    tx_id: tx.tx_id,
    user_id: tx.user_id,
    linked_wallet_id: tx.linked_wallet_id,
    chain: tx.chain,
    type: tx.type,
    tx_hash: tx.tx_hash,
    from_address: tx.from_address,
    to_address: tx.to_address,
    amount: tx.amount,
    confirmations: tx.confirmations,
    status: tx.status,
    confirmed_at: tx.confirmed_at,
    credited_currency_id: tx.credited_currency_id,
    credited_amount: tx.credited_amount,
    conversion_rate: tx.conversion_rate,
    treasury_operation_id: tx.treasury_operation_id,
    asset,
    created_at: tx.created_at,
  };
}

@Injectable()
export class TreasuryOnchainReadRepository implements TreasuryOnchainReadRepositoryPort {
  constructor(private readonly dataSource: DataSource) {}

  async listFundSweepTransactions(filter: ListTreasuryTransactionsDto): Promise<{
    items: BlockchainOnchainTransactionRecord[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;
    const offset = calcSkip(page, limit);

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
      qb.andWhere(
        '(tx.tx_hash LIKE :q OR tx.tx_id LIKE :q OR tx.from_address LIKE :q OR tx.to_address LIKE :q)',
        {
          q: `%${filter.q}%`,
        },
      );
    }

    const [rows, total] = await qb.getManyAndCount();

    const opIds = [
      ...new Set(
        rows
          .map((t) => t.treasury_operation_id)
          .filter((id): id is string => typeof id === 'string' && id.length > 0),
      ),
    ];

    const assetByOpId = new Map<string, 'NATIVE' | 'USDT_TRC20'>();
    if (opIds.length > 0) {
      const ops = await this.dataSource.getRepository(TreasuryOperation).find({
        where: { operation_id: In(opIds) },
        select: ['operation_id', 'asset'],
      });
      for (const op of ops) {
        assetByOpId.set(op.operation_id, op.asset);
      }
    }

    const items = rows.map((tx) =>
      mapOnchainToTreasuryHistoryRecord(
        tx,
        tx.treasury_operation_id
          ? (assetByOpId.get(tx.treasury_operation_id) ?? 'NATIVE')
          : null,
      ),
    );

    return { items, total, page, limit };
  }
}
