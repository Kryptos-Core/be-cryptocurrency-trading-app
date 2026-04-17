import { Injectable } from '@nestjs/common';
import { OrderQueueService } from './order-queue.service';

/**
 * Buy Queue (Queue Pattern)
 * Price-time priority: best bid first (price DESC), then oldest (created_at ASC).
 * Uses BigInt comparison for deterministic precision on DECIMAL(36,18) prices.
 */
@Injectable()
export class BuyQueueService extends OrderQueueService {
  constructor() {
    super('BUY', 'DESC', 0n);
  }
}
