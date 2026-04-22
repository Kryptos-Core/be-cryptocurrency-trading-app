import { Inject, Injectable, Logger } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { uuidv7 } from 'uuidv7';
import { OnchainTxStatus, UserRole } from '@/common/enums';
import { BadRequestException, BusinessException, ConflictException } from '@/common/exceptions';
import { OutboxIntegrationEventType } from '@/common/integration-events/integration-event-catalog';
import { OutboxAppender } from '@/common/outbox/outbox-appender.service';
import { UnitOfWork } from '@/common/unit-of-work/unit-of-work';
import {
  DEPOSIT_MATCH_REQUEST_REPOSITORY,
  type DepositMatchRequestRepositoryPort,
  ONCHAIN_TRANSACTION_REPOSITORY,
  type OnchainTransactionRepositoryPort,
} from '../../../domain/ports';
import { DepositMatchRequest } from '../../../entities/deposit-match-request.entity';
import { OnchainDepositService } from './onchain-deposit.service';

const PROPOSE_DAILY_LIMIT = 5;
const APPROVE_DAILY_LIMIT = 5;

@Injectable()
export class DepositMatchService {
  private readonly logger = new Logger(DepositMatchService.name);

  constructor(
    @Inject(DEPOSIT_MATCH_REQUEST_REPOSITORY)
    private readonly matchRepo: DepositMatchRequestRepositoryPort,
    @Inject(ONCHAIN_TRANSACTION_REPOSITORY)
    private readonly onchainTxRepo: OnchainTransactionRepositoryPort,
    private readonly unitOfWork: UnitOfWork,
    private readonly outboxAppender: OutboxAppender,
    private readonly depositService: OnchainDepositService,
  ) {}

  async proposeMatch(
    proposerId: string,
    proposerRole: UserRole,
    txId: string,
    requestedUserId: string,
    idempotencyKey: string,
  ): Promise<{ matchId: string; status: 'PENDING' }> {
    const existing = await this.matchRepo.findByIdempotencyKey(idempotencyKey);
    if (existing) {
      return { matchId: existing.match_id, status: 'PENDING' };
    }

    const tx = await this.onchainTxRepo.findById(txId);
    if (!tx) {
      throw new BadRequestException('Giao dịch on-chain không tồn tại', 'TX_NOT_FOUND');
    }
    if (tx.status !== OnchainTxStatus.UNMATCHED) {
      throw new BadRequestException(
        `Giao dịch không ở trạng thái UNMATCHED (hiện tại: ${tx.status})`,
        'TX_NOT_UNMATCHED',
      );
    }
    if (tx.type !== 'DEPOSIT') {
      throw new BadRequestException('Chỉ hỗ trợ gán user cho giao dịch DEPOSIT', 'TX_NOT_DEPOSIT');
    }

    const pending = await this.matchRepo.findPendingByTxId(txId);
    if (pending) {
      throw new ConflictException(
        `Đã có yêu cầu match đang PENDING (matchId: ${pending.match_id}). Hãy approve hoặc cancel trước.`,
        'MATCH_ALREADY_PENDING',
      );
    }

    const todayCount = await this.matchRepo.countByProposerToday(proposerId);
    if (todayCount >= PROPOSE_DAILY_LIMIT) {
      throw new BadRequestException(
        `Bạn đã vượt giới hạn ${PROPOSE_DAILY_LIMIT} đề xuất match/ngày`,
        'PROPOSE_RATE_LIMIT',
      );
    }

    const matchId = uuidv7();
    const now = new Date();
    const auditEntry = {
      action: 'PROPOSED' as const,
      actor_id: proposerId,
      actor_role: proposerRole,
      at: now.toISOString(),
    };

    const record = Object.assign(new DepositMatchRequest(), {
      match_id: matchId,
      tx_id: txId,
      requested_user_id: requestedUserId,
      proposer_id: proposerId,
      proposer_role: proposerRole,
      approver_id: null,
      approver_role: null,
      status: 'PENDING' as const,
      idempotency_key: idempotencyKey,
      proposed_at: now,
      resolved_at: null,
      audit_log: [auditEntry],
    });

    await this.matchRepo.save(record);

    this.logger.log(
      JSON.stringify({
        domain: 'treasury',
        event: 'deposit.match.proposed',
        matchId,
        txId,
        requestedUserId,
        proposerId,
        at: now.toISOString(),
      }),
    );

    return { matchId, status: 'PENDING' };
  }

  async approveMatch(
    approverId: string,
    approverRole: UserRole,
    matchId: string,
  ): Promise<{ matchId: string; status: 'APPROVED'; settled: boolean }> {
    const match = await this.matchRepo.findById(matchId);
    if (!match) {
      throw new BadRequestException('Yêu cầu match không tồn tại', 'MATCH_NOT_FOUND');
    }
    if (match.status !== 'PENDING') {
      throw new BadRequestException(
        `Yêu cầu match không còn ở trạng thái PENDING (hiện tại: ${match.status})`,
        'MATCH_NOT_PENDING',
      );
    }
    if (match.proposer_id === approverId) {
      throw new BadRequestException(
        'Người đề xuất không thể tự approve yêu cầu của mình',
        'SELF_APPROVAL_FORBIDDEN',
      );
    }

    const todayCount = await this.matchRepo.countByApproverToday(approverId);
    if (todayCount >= APPROVE_DAILY_LIMIT) {
      throw new BadRequestException(
        `Bạn đã vượt giới hạn ${APPROVE_DAILY_LIMIT} approve match/ngày`,
        'APPROVE_RATE_LIMIT',
      );
    }

    const tx = await this.onchainTxRepo.findById(match.tx_id);
    if (!tx) {
      throw new BusinessException(
        'Giao dịch on-chain liên quan không còn tồn tại',
        'TX_DISAPPEARED',
      );
    }
    if (tx.status !== OnchainTxStatus.UNMATCHED) {
      throw new ConflictException(
        `Giao dịch không còn ở trạng thái UNMATCHED (hiện tại: ${tx.status})`,
        'TX_ALREADY_MATCHED',
      );
    }

    const now = new Date();
    const userId = match.requested_user_id;

    await this.unitOfWork.run(async (ctx) => {
      const em = ctx as unknown as EntityManager;

      await this.onchainTxRepo.setMatchedUser(ctx, match.tx_id, userId, OnchainTxStatus.CONFIRMING);

      const newLog = [
        ...match.audit_log,
        {
          action: 'APPROVED' as const,
          actor_id: approverId,
          actor_role: approverRole,
          at: now.toISOString(),
        },
      ];
      await this.matchRepo.updateStatus(matchId, 'APPROVED', {
        approver_id: approverId,
        approver_role: approverRole,
        resolved_at: now,
        audit_log: newLog,
      });

      await this.outboxAppender.append(em, {
        aggregateType: 'OnchainTransaction',
        aggregateId: match.tx_id,
        eventType: OutboxIntegrationEventType.DepositMatchedV1,
        dedupeKey: `deposit:matched:${matchId}`,
        payload: {
          payloadVersion: 1,
          matchId,
          txId: match.tx_id,
          userId,
          proposerId: match.proposer_id,
          proposerRole: match.proposer_role,
          approverId,
          approverRole,
          resolvedAt: now.toISOString(),
        },
      });
    });

    this.logger.log(
      JSON.stringify({
        domain: 'treasury',
        event: 'deposit.match.approved',
        matchId,
        txId: match.tx_id,
        userId,
        approverId,
        at: now.toISOString(),
      }),
    );

    let settled = false;
    try {
      const result = await this.depositService.settleDepositByTxId(userId, match.tx_id);
      settled = result.settled;
    } catch (err: any) {
      this.logger.warn(
        JSON.stringify({
          domain: 'treasury',
          event: 'deposit.match.settle_deferred',
          matchId,
          txId: match.tx_id,
          reason: err?.message,
          at: new Date().toISOString(),
        }),
      );
    }

    return { matchId, status: 'APPROVED', settled };
  }
}
