import type { QueryDeepPartialEntity } from 'typeorm';
import type {
  TreasuryMainWalletChain,
  TreasuryOperationAsset,
  TreasuryOperationRecord,
} from '@/modules/treasury/contracts';
import type { ListTreasuryOperationsDto } from '../../dto';

/**
 * Port: Treasury operation repository abstraction.
 */
export interface TreasuryOperationRepositoryPort {
  createPendingOperation(params: {
    type: 'SWEEP' | 'FUND';
    chain: TreasuryMainWalletChain;
    fromWalletId: string | null;
    toWalletId: string | null;
    amount: string;
    asset?: TreasuryOperationAsset;
    actorUserId: string;
  }): Promise<TreasuryOperationRecord>;

  findByOperationIdWithWallets(operationId: string): Promise<TreasuryOperationRecord | null>;
  findByOperationId(operationId: string): Promise<TreasuryOperationRecord | null>;

  /** Same wallet + type + asset + actor still PENDING/PROCESSING (fund/sweep idempotency). */
  findActiveDuplicateOperation(params: {
    type: 'SWEEP' | 'FUND';
    walletId: string;
    asset: TreasuryOperationAsset;
    amount: string;
    actorUserId: string;
  }): Promise<TreasuryOperationRecord | null>;
  countNonTerminalForWallet(walletId: string): Promise<number>;
  updateByOperationId(
    operationId: string,
    partial: QueryDeepPartialEntity<TreasuryOperationRecord>,
  ): Promise<void>;

  listWithFilters(filter: ListTreasuryOperationsDto): Promise<{
    items: TreasuryOperationRecord[];
    total: number;
    page: number;
    limit: number;
  }>;

  finalizeSuccessWithOnchainTx(params: {
    operation: TreasuryOperationRecord;
    fromAddress: string;
    toAddress: string;
    txHash: string;
    amount: string;
  }): Promise<void>;
}
