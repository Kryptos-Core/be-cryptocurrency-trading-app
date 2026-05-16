import { Injectable } from '@nestjs/common';
import { BaseCommand, type ICommandHandler } from '@/common/cqrs';
import { OnchainTxStatus } from '../../domain/entities/onchain-transaction.entity';
import { OnchainWithdrawalService } from './withdrawals/onchain-withdrawal.service';

/**
 * Admin manual reconciliation for stuck withdrawals.
 * Allows admin to manually settle a withdrawal that is stuck in CONFIRMING state
 * or to force-complete/fail a withdrawal with proper balance adjustment.
 */
export class AdminReconcileWithdrawalCommand extends BaseCommand {
  constructor(
    public readonly actorUserId: string,
    public readonly txId: string,
    public readonly action: 'settle' | 'force_complete' | 'force_fail' | 'force_refund',
    public readonly reason?: string,
    correlationId?: string,
  ) {
    super(correlationId);
  }
}

export interface AdminReconcileResult {
  txId: string;
  previousStatus: string;
  newStatus: string;
  action: string;
  reason?: string;
  balanceAdjusted: boolean;
  error?: string;
}

@Injectable()
export class AdminReconcileWithdrawalUseCase
  implements
    ICommandHandler<
      AdminReconcileWithdrawalCommand,
      Promise<AdminReconcileResult>
    >
{
  constructor(private readonly withdrawalService: OnchainWithdrawalService) {}

  async execute(command: AdminReconcileWithdrawalCommand): Promise<AdminReconcileResult> {
    const { txId, action, reason } = command;

    try {
      // settle: re-check blockchain status and settle accordingly
      if (action === 'settle') {
        const result = await this.withdrawalService.settleWithdrawalByTxId(txId);
        return {
          txId,
          previousStatus: 'CONFIRMING',
          newStatus: result.status,
          action,
          balanceAdjusted: result.status === 'COMPLETED' || result.status === 'FAILED',
        };
      }

      // force_complete: mark as COMPLETED (admin is certain TX is confirmed on-chain)
      if (action === 'force_complete') {
        await this.withdrawalService.forceCompleteWithdrawal(txId);
        return {
          txId,
          previousStatus: 'CONFIRMING',
          newStatus: OnchainTxStatus.COMPLETED,
          action,
          reason,
          balanceAdjusted: false,
        };
      }

      // force_fail: mark as FAILED and refund frozen balance to user
      if (action === 'force_fail') {
        await this.withdrawalService.forceFailWithdrawal(txId, reason ?? 'Admin force failed');
        return {
          txId,
          previousStatus: 'CONFIRMING',
          newStatus: OnchainTxStatus.FAILED,
          action,
          reason,
          balanceAdjusted: true,
        };
      }

      // force_refund: refund frozen balance without changing tx status
      // Use when user was debited but TX was never recorded properly
      if (action === 'force_refund') {
        await this.withdrawalService.forceRefundWithdrawal(txId, reason ?? 'Admin force refund');
        return {
          txId,
          previousStatus: 'CONFIRMING',
          newStatus: 'CONFIRMING',
          action,
          reason,
          balanceAdjusted: true,
        };
      }

      return {
        txId,
        previousStatus: 'CONFIRMING',
        newStatus: 'CONFIRMING',
        action,
        balanceAdjusted: false,
        error: `Unknown action: ${action}`,
      };
    } catch (err) {
      return {
        txId,
        previousStatus: 'CONFIRMING',
        newStatus: 'ERROR',
        action,
        balanceAdjusted: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
