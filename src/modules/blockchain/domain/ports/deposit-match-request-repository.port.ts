import type { TransactionContext } from '@/common/types/transaction-context';
import type {
  DepositMatchRequest,
  DepositMatchRequestStatus,
} from '../../entities/deposit-match-request.entity';

export const DEPOSIT_MATCH_REQUEST_REPOSITORY = Symbol('DEPOSIT_MATCH_REQUEST_REPOSITORY');

export interface DepositMatchRequestRepositoryPort {
  save(entity: DepositMatchRequest): Promise<DepositMatchRequest>;
  findById(matchId: string): Promise<DepositMatchRequest | null>;
  findPendingByTxId(txId: string): Promise<DepositMatchRequest | null>;
  findByIdempotencyKey(key: string): Promise<DepositMatchRequest | null>;
  countByProposerToday(proposerId: string): Promise<number>;
  countByApproverToday(approverId: string): Promise<number>;
  updateStatus(
    matchId: string,
    status: DepositMatchRequestStatus,
    extra: {
      approver_id?: string;
      approver_role?: string;
      resolved_at?: Date;
      audit_log: import('../../entities/deposit-match-request.entity').DepositMatchAuditEntry[];
    },
  ): Promise<void>;
  updateStatusWithinTransaction(
    ctx: TransactionContext,
    matchId: string,
    status: DepositMatchRequestStatus,
    extra: {
      approver_id?: string;
      approver_role?: string;
      resolved_at?: Date;
      audit_log: import('../../entities/deposit-match-request.entity').DepositMatchAuditEntry[];
    },
  ): Promise<void>;
}
