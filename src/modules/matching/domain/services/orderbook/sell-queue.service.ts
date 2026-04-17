import { Injectable } from '@nestjs/common';
import { DEFAULT_SCALE, toBaseUnits } from '../../../utils';
import { OrderQueueService } from './order-queue.service';

/**
 * Sell Queue (Queue Pattern)
 * Price-time priority: best ask first (price ASC), then oldest (created_at ASC).
 * Uses BigInt comparison for deterministic precision on DECIMAL(36,18) prices.
 */
@Injectable()
export class SellQueueService extends OrderQueueService {
  constructor() {
    const maxPrice = toBaseUnits('999999999999999999.999999999999999999', DEFAULT_SCALE);
    super('SELL', 'ASC', maxPrice);
  }
}
