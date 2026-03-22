import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { OnchainTransaction } from '@/entities/onchain-transaction.entity';
import { ListTreasuryTransactionsDto } from '../dto';

@Injectable()
export class TreasuryOnchainReadRepository {
  constructor(private readonly dataSource: DataSource) {}

  async listFundSweepTransactions(filter: ListTreasuryTransactionsDto): Promise<{
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
}
