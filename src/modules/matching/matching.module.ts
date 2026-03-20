import { Module } from '@nestjs/common';
import { MatchingService } from './matching.service';
import { OrderBookService } from './orderbook';
import { BuyQueueService } from './orderbook/buy-queue.service';
import { SellQueueService } from './orderbook/sell-queue.service';
import { MatchingRepository } from './repositories';
import { PriceTimePriorityStrategy } from './strategies/price-time-priority.strategy';
import { MarketOrderStrategy } from './strategies/market-order.strategy';
import { AuditTradeVisitor, MetricsTradeVisitor } from './visitors';

/**
 * Matching Module
 * Core engine: order matching (price-time priority), trade execution, order book, lock, observer.
 * Visitor Pattern: AuditTradeVisitor and MetricsTradeVisitor registered as trade observers.
 */
@Module({
  providers: [
    BuyQueueService,
    SellQueueService,
    OrderBookService,
    MatchingRepository,
    PriceTimePriorityStrategy,
    MarketOrderStrategy,
    AuditTradeVisitor,
    MetricsTradeVisitor,
    MatchingService,
  ],
  exports: [MatchingService, MetricsTradeVisitor],
})
export class MatchingModule {}
