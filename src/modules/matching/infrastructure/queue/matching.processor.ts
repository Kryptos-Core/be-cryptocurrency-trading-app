import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { runInSpan } from '@/common/telemetry';
import { RunMatchCommand, RunMatchUseCase } from '../../application/use-cases';
import { MATCH_ORDER_JOB, MATCHING_QUEUE, type MatchOrderJobData } from './matching-queue.service';

@Processor(MATCHING_QUEUE)
export class MatchingProcessor {
  private readonly logger = new Logger(MatchingProcessor.name);

  constructor(private readonly runMatchUseCase: RunMatchUseCase) {}

  @Process({ name: MATCH_ORDER_JOB, concurrency: 1 })
  async handleMatch(job: Job<MatchOrderJobData>): Promise<void> {
    const { takerOrder, pairId, feeCurrencyId, makerFeeRate, takerFeeRate, slippageTolerance } =
      job.data;
    this.logger.debug(
      `Processing match job ${job.id} - order=${takerOrder.order_id} pair=${pairId}`,
    );
    await runInSpan(
      'MatchingProcessor.handleMatch',
      async () =>
        this.runMatchUseCase.execute(
          new RunMatchCommand(
            takerOrder,
            pairId,
            feeCurrencyId,
            makerFeeRate,
            takerFeeRate,
            slippageTolerance,
          ),
        ),
      { module: 'matching', pairId, orderId: takerOrder.order_id },
    );
  }
}
