import { InjectQueue } from '@nestjs/bull';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bull';
import type { OrderBookOrder } from './interfaces';

export const MATCHING_QUEUE = 'matching';
export const MATCH_ORDER_JOB = 'match-order';

export interface MatchOrderJobData {
  takerOrder: OrderBookOrder;
  pairId: string;
  feeCurrencyId: string;
  makerFeeRate: string;
  takerFeeRate: string;
  /** Max price slippage allowed for MARKET orders (e.g. '0.01' = 1%). Absent means no protection. */
  slippageTolerance?: string;
}

/**
 * MatchingQueueService — thin enqueue wrapper.
 * Produces MATCH_ORDER_JOB into the 'matching' Bull queue so order matching
 * is decoupled from the HTTP request thread (Phase 2 #6).
 *
 * Consumer: MatchingProcessor.handleMatch (same module).
 * OrdersService.create() calls enqueueMatch() instead of runMatch() directly.
 */
@Injectable()
export class MatchingQueueService {
  constructor(
    @InjectQueue(MATCHING_QUEUE) private readonly matchingQueue: Queue<MatchOrderJobData>,
  ) {}

  async enqueueMatch(data: MatchOrderJobData): Promise<void> {
    await this.matchingQueue.add(MATCH_ORDER_JOB, data, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 500 },
      removeOnComplete: true,
      removeOnFail: false,
    });
  }
}
