import type { BlockchainOnchainTransactionRecord } from '@/modules/blockchain';
import type { ListTreasuryTransactionsDto } from '../../dto';

/**
 * Port: Read-only repository for on-chain fund/sweep transaction queries.
 */
export interface TreasuryOnchainReadRepositoryPort {
  listFundSweepTransactions(filter: ListTreasuryTransactionsDto): Promise<{
    items: BlockchainOnchainTransactionRecord[];
    total: number;
    page: number;
    limit: number;
  }>;
}


