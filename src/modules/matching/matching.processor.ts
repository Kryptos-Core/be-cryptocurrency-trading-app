import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { RunMatchCommand, RunMatchUseCase } from './application/use-cases';
import { MATCH_ORDER_JOB, MATCHING_QUEUE, type MatchOrderJobData } from './matching-queue.service';

/**
 * MatchingProcessor — Bull queue consumer.
 * Picks up MATCH_ORDER_JOB jobs and delegates to the application use-case.
 * Errors are rethrown so Bull can apply the retry policy from MatchingQueueService.enqueueMatch().
 * concurrency: 1 per queue reduces in-memory order book races when multiple workers share Redis.
 */
@Processor(MATCHING_QUEUE)
export class MatchingProcessor {
  private readonly logger = new Logger(MatchingProcessor.name);

  constructor(private readonly runMatchUseCase: RunMatchUseCase) {}

  @Process({ name: MATCH_ORDER_JOB, concurrency: 1 })
  async handleMatch(job: Job<MatchOrderJobData>): Promise<void> {
    const { takerOrder, pairId, feeCurrencyId, makerFeeRate, takerFeeRate, slippageTolerance } =
      job.data;
    this.logger.debug(
      `Processing match job ${job.id} — order=${takerOrder.order_id} pair=${pairId}`,
    );
    await this.runMatchUseCase.execute(
      new RunMatchCommand(
        takerOrder,
        pairId,
        feeCurrencyId,
        makerFeeRate,
        takerFeeRate,
        slippageTolerance,
      ),
    );
  }
}
