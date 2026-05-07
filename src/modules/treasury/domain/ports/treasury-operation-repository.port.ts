import type { QueryDeepPartialEntity } from 'typeorm';
import type { BlockchainChainDbValue } from '@/common/constants/blockchain-chain-db';
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

  /** Atomic: set broadcast_idempotency_key + status=TX_BROADCAST BEFORE calling RPC.
   * Conditional — only updates if status is PENDING or PROCESSING (not already TX_BROADCAST/COMPLETED).
   * Returns true if the row was updated (this attempt owns the broadcast), false otherwise.
   */
  setBroadcastIdempotencyKey(operationId: string, key: string): Promise<boolean>;

  /** Find stale TX_BROADCAST operations for reconciliation. */
  findStaleTxBroadcastOperations(olderThanMinutes: number): Promise<TreasuryOperationRecord[]>;

  /** Existing on-chain row for duplicate (chain + tx_hash + log_index unique). */
  findOnchainTreasuryLeg(
    chain: BlockchainChainDbValue,
    txHash: string,
    logIndex: number,
  ): Promise<{ treasury_operation_id: string | null } | null>;
}
