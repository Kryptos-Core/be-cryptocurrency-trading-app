import { InjectQueue } from '@nestjs/bull';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Queue } from 'bull';
import type { OrderBookOrder } from '../../interfaces';
import { MatchingEngineRoutingPolicy } from './matching-engine-routing.policy';

export const MATCHING_QUEUE = 'matching';
export const MATCH_ORDER_JOB = 'match-order';

export interface MatchOrderJobData {
  takerOrder: OrderBookOrder;
  pairId: string;
  feeCurrencyId: string;
  makerFeeRate: string;
  takerFeeRate: string;
  slippageTolerance?: string;
}

@Injectable()
export class MatchingQueueService {
  private readonly routingPolicy: MatchingEngineRoutingPolicy;

  constructor(
    @InjectQueue(MATCHING_QUEUE) private readonly matchingQueue: Queue<MatchOrderJobData>,
    private readonly configService: ConfigService,
  ) {
    this.routingPolicy = new MatchingEngineRoutingPolicy(
      this.configService.get<string>('MATCHING_ENGINE'),
      this.configService.get<string>('MATCHING_GO_CANARY_PAIRS'),
    );
  }

  async enqueueMatch(data: MatchOrderJobData): Promise<void> {
    if (this.routingPolicy.shouldEnqueueShadow(data.pairId)) {
      await this.enqueueShadowJob(data);
    }

    await this.enqueuePrimaryJob(data);
  }

  private async enqueuePrimaryJob(data: MatchOrderJobData): Promise<void> {
    await this.matchingQueue.add(MATCH_ORDER_JOB, data, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 500 },
      removeOnComplete: true,
      removeOnFail: false,
    });
  }

  private async enqueueShadowJob(data: MatchOrderJobData): Promise<void> {
    await this.matchingQueue.add(`${MATCH_ORDER_JOB}:shadow`, data, {
      attempts: 1,
      removeOnComplete: true,
      removeOnFail: false,
    });
  }
}
