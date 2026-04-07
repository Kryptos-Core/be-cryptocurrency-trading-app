import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { MatchingService } from './matching.service';
import { OrderBookService } from './orderbook';
import { BuyQueueService } from './orderbook/buy-queue.service';
import { SellQueueService } from './orderbook/sell-queue.service';
import { MatchingRepository } from './repositories';
import { PriceTimePriorityStrategy } from './strategies/price-time-priority.strategy';
import { MarketOrderStrategy } from './strategies/market-order.strategy';
import { AuditTradeVisitor, MetricsTradeVisitor } from './visitors';
import { TradeAuditLogRepository } from './visitors/trade-audit-log.repository';
import { TradeAuditLog } from '@/entities/trade-audit-log.entity';
import { CircuitBreakerService } from './circuit-breaker.service';
import { MatchingQueueService, MATCHING_QUEUE } from './matching-queue.service';
import { MatchingProcessor } from './matching.processor';

/**
 * Matching Module
 * Core engine: order matching (price-time priority), trade execution, order book, lock, observer.
 * Visitor Pattern: AuditTradeVisitor and MetricsTradeVisitor registered as trade observers.
 * Queue Pattern: MatchingQueueService enqueues MATCH_ORDER_JOB; MatchingProcessor consumes.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([TradeAuditLog]),
    BullModule.registerQueue({ name: MATCHING_QUEUE }),
  ],
  providers: [
    BuyQueueService,
    SellQueueService,
    OrderBookService,
    MatchingRepository,
    PriceTimePriorityStrategy,
    MarketOrderStrategy,
    TradeAuditLogRepository,
    AuditTradeVisitor,
    MetricsTradeVisitor,
    CircuitBreakerService,
    MatchingService,
    MatchingQueueService,
    MatchingProcessor,
  ],
  exports: [MatchingService, MatchingQueueService, MetricsTradeVisitor, CircuitBreakerService, OrderBookService],
})
export class MatchingModule {}
