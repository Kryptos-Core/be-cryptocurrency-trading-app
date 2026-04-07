import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { MatchingService } from './matching.service';
import { MATCHING_QUEUE, MATCH_ORDER_JOB, MatchOrderJobData } from './matching-queue.service';

/**
 * MatchingProcessor — Bull queue consumer.
 * Picks up MATCH_ORDER_JOB jobs and delegates to MatchingService.runMatch().
 * Errors are rethrown so Bull can apply the retry policy from MatchingQueueService.enqueueMatch().
 */
@Processor(MATCHING_QUEUE)
export class MatchingProcessor {
  private readonly logger = new Logger(MatchingProcessor.name);

  constructor(private readonly matchingService: MatchingService) {}

  @Process(MATCH_ORDER_JOB)
  async handleMatch(job: Job<MatchOrderJobData>): Promise<void> {
    const { takerOrder, pairId, feeCurrencyId, makerFeeRate, takerFeeRate, slippageTolerance } = job.data;
    this.logger.debug(
      `Processing match job ${job.id} — order=${takerOrder.order_id} pair=${pairId}`,
    );
    try {
      await this.matchingService.runMatch({ takerOrder, pairId, feeCurrencyId, makerFeeRate, takerFeeRate, slippageTolerance });
    } catch (error) {
      this.logger.error(
        `Match job ${job.id} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error; // Rethrow → Bull retries per enqueueMatch options
    }
  }
}
