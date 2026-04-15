import type { OnchainTransaction } from '@/entities/onchain-transaction.entity';
import type { ListTreasuryTransactionsDto } from '../../dto';

/**
 * Port: Read-only repository for on-chain fund/sweep transaction queries.
 */
export interface TreasuryOnchainReadRepositoryPort {
  listFundSweepTransactions(filter: ListTreasuryTransactionsDto): Promise<{
    items: OnchainTransaction[];
    total: number;
    page: number;
    limit: number;
  }>;
}
