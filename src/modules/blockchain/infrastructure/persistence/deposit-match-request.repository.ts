import { Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import type { TransactionContext } from '@/common/types/transaction-context';
import type { DepositMatchRequestRepositoryPort } from '../../domain/ports/deposit-match-request-repository.port';
import type {
  DepositMatchAuditEntry,
  DepositMatchRequestStatus,
} from '../../entities/deposit-match-request.entity';
import { DepositMatchRequest } from '../../entities/deposit-match-request.entity';

function toEntityManager(ctx: TransactionContext): EntityManager {
  return ctx as unknown as EntityManager;
}

@Injectable()
export class DepositMatchRequestRepository implements DepositMatchRequestRepositoryPort {
  constructor(private readonly dataSource: DataSource) {}

  async save(entity: DepositMatchRequest): Promise<DepositMatchRequest> {
    return this.dataSource.getRepository(DepositMatchRequest).save(entity);
  }

  async findById(matchId: string): Promise<DepositMatchRequest | null> {
    return this.dataSource.getRepository(DepositMatchRequest).findOne({
      where: { match_id: matchId },
    });
  }

  async findPendingByTxId(txId: string): Promise<DepositMatchRequest | null> {
    return this.dataSource.getRepository(DepositMatchRequest).findOne({
      where: { tx_id: txId, status: 'PENDING' },
    });
  }

  async findByIdempotencyKey(key: string): Promise<DepositMatchRequest | null> {
    return this.dataSource.getRepository(DepositMatchRequest).findOne({
      where: { idempotency_key: key },
    });
  }

  async countByProposerToday(proposerId: string): Promise<number> {
    const [{ cnt }] = await this.dataSource.query(
      `SELECT COUNT(*) AS cnt FROM deposit_match_requests
       WHERE proposer_id = $1 AND proposed_at >= CURRENT_DATE`,
      [proposerId],
    );
    return Number(cnt);
  }

  async countByApproverToday(approverId: string): Promise<number> {
    const [{ cnt }] = await this.dataSource.query(
      `SELECT COUNT(*) AS cnt FROM deposit_match_requests
       WHERE approver_id = $1 AND resolved_at >= CURRENT_DATE`,
      [approverId],
    );
    return Number(cnt);
  }

  async updateStatus(
    matchId: string,
    status: DepositMatchRequestStatus,
    extra: {
      approver_id?: string;
      approver_role?: string;
      resolved_at?: Date;
      audit_log: DepositMatchAuditEntry[];
    },
  ): Promise<void> {
    await this.dataSource.getRepository(DepositMatchRequest).update(
      { match_id: matchId },
      {
        status,
        approver_id: extra.approver_id ?? null,
        approver_role: extra.approver_role ?? null,
        resolved_at: extra.resolved_at ?? null,
        audit_log: extra.audit_log,
      },
    );
  }

  async updateStatusWithinTransaction(
    ctx: TransactionContext,
    matchId: string,
    status: DepositMatchRequestStatus,
    extra: {
      approver_id?: string;
      approver_role?: string;
      resolved_at?: Date;
      audit_log: DepositMatchAuditEntry[];
    },
  ): Promise<void> {
    await toEntityManager(ctx)
      .getRepository(DepositMatchRequest)
      .update(
        { match_id: matchId },
        {
          status,
          approver_id: extra.approver_id ?? null,
          approver_role: extra.approver_role ?? null,
          resolved_at: extra.resolved_at ?? null,
          audit_log: extra.audit_log,
        },
      );
  }
}
