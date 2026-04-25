import { randomUUID } from 'node:crypto';
import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import type { Job } from 'bull';
import { runInSpan } from '@/common/telemetry';
import { RunMatchCommand, RunMatchUseCase } from '../../application/use-cases';
import { MATCH_ORDER_JOB, MATCHING_QUEUE, type MatchOrderJobData } from './matching-queue.service';
import { MatchingEngineRoutingPolicy } from './matching-engine-routing.policy';

@Processor(MATCHING_QUEUE)
export class MatchingProcessor {
  private readonly logger = new Logger(MatchingProcessor.name);
  private readonly routingPolicy: MatchingEngineRoutingPolicy;

  constructor(
    private readonly runMatchUseCase: RunMatchUseCase,
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
  ) {
    this.routingPolicy = new MatchingEngineRoutingPolicy(
      this.configService.get<string>('MATCHING_ENGINE'),
      this.configService.get<string>('MATCHING_GO_CANARY_PAIRS'),
    );
  }

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

  @Process({ name: `${MATCH_ORDER_JOB}:shadow`, concurrency: 1 })
  async handleShadowMatch(job: Job<MatchOrderJobData>): Promise<void> {
    const { takerOrder, pairId } = job.data;
    if (!this.routingPolicy.shouldEnqueueShadow(pairId)) {
      return;
    }
    await this.dataSource.query(
      `INSERT INTO shadow_matching_runs (
         run_id, pair_id, order_id, mode, status, payload, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, NOW())`,
      [
        randomUUID(),
        pairId,
        takerOrder.order_id,
        this.routingPolicy.mode,
        'accepted',
        JSON.stringify({
          jobId: job.id,
          queue: MATCH_ORDER_JOB,
          takerOrder,
          pairId,
          receivedAt: new Date().toISOString(),
          routingMode: this.routingPolicy.mode,
        }),
      ],
    );

    this.logger.debug(
      `Go shadow/canary matching placeholder accepted job ${job.id} - mode=${this.routingPolicy.mode} order=${takerOrder.order_id} pair=${pairId}`,
    );
  }
}

