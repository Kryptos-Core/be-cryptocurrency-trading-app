import { Module } from '@nestjs/common';
import { MatchingService } from './matching.service';
import { OrderBookService } from './orderbook';
import { BuyQueueService } from './orderbook/buy-queue.service';
import { SellQueueService } from './orderbook/sell-queue.service';
import { MatchingRepository } from './repositories';
import { PriceTimePriorityStrategy } from './strategies/price-time-priority.strategy';
import { MarketOrderStrategy } from './strategies/market-order.strategy';

/**
 * Matching Module
 * Core engine: order matching (price-time priority), trade execution, order book, lock, observer.
 */
@Module({
  providers: [
    BuyQueueService,
    SellQueueService,
    OrderBookService,
    MatchingRepository,
    PriceTimePriorityStrategy,
    MarketOrderStrategy,
    MatchingService,
  ],
  exports: [MatchingService],
})
export class MatchingModule {}
