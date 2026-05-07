import { InjectQueue } from '@nestjs/bull';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type { Queue } from 'bull';
import { TREASURY_CONFIRM_JOB, TREASURY_QUEUE } from './constants';
import {
  TREASURY_OPERATION_REPOSITORY,
  type TreasuryOperationRepositoryPort,
} from './domain/ports';

/** Bull provides getJob at runtime — augment the Queue type so TS is satisfied. */
type TreasuryQueueWithGetJob = Queue & { getJob(jobId: string): Promise<unknown> };

/** Max age before a TX_BROADCAST operation is considered stale and needs confirm re-enqueue. */
const STALE_TX_BROADCAST_MINUTES = 2;

@Injectable()
export class TreasuryReconciliationScheduler {
  private readonly logger = new Logger(TreasuryReconciliationScheduler.name);

  constructor(
    @InjectQueue(TREASURY_QUEUE) private readonly treasuryQueue: TreasuryQueueWithGetJob,
    @Inject(TREASURY_OPERATION_REPOSITORY)
    private readonly treasuryOperationRepository: TreasuryOperationRepositoryPort,
  ) {}

  /**
   * Every minute: find TX_BROADCAST operations with no pending confirm job and re-enqueue them.
   * Handles scenario C3 from the chaos testing plan (worker crash after broadcast, before confirm enqueue).
   */
  @Cron('*/1 * * * *')
  async reconcileStaleTxBroadcastOperations(): Promise<void> {
    try {
      const stale = await this.treasuryOperationRepository.findStaleTxBroadcastOperations(
        STALE_TX_BROADCAST_MINUTES,
      );

      for (const op of stale) {
        const confirmJobId = `treasury-confirm:${op.operation_id}`;
        const existingJob = await this.treasuryQueue.getJob(confirmJobId);

        if (!existingJob) {
          this.logger.warn(
            `Reconcile: re-enqueuing confirm job for stale TX_BROADCAST operation=${op.operation_id}`,
          );
          await this.treasuryQueue.add(
            TREASURY_CONFIRM_JOB,
            { operationId: op.operation_id },
            {
              jobId: confirmJobId,
              attempts: 10,
              removeOnComplete: true,
              removeOnFail: true,
              timeout: 5 * 60_000,
            },
          );
        }
      }
    } catch (error) {
      this.logger.error(`Treasury reconciliation failed: ${(error as Error).message}`);
    }
  }
}
