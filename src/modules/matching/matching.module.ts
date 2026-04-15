import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TradeAuditLog } from '@/entities/trade-audit-log.entity';
import { CircuitBreakerService } from './circuit-breaker.service';
import { MATCHING_REPOSITORY, TRADE_AUDIT_LOG_REPOSITORY } from './domain/ports';
import { MatchingProcessor } from './matching.processor';
import { MatchingService } from './matching.service';
import { MATCHING_QUEUE, MatchingQueueService } from './matching-queue.service';
import { OrderBookService } from './orderbook';
import { BuyQueueService } from './orderbook/buy-queue.service';
import { SellQueueService } from './orderbook/sell-queue.service';
import { MatchingRepository, TradeAuditLogRepository } from './infrastructure/persistence';
import { MarketOrderStrategy } from './strategies/market-order.strategy';
import { PriceTimePriorityStrategy } from './strategies/price-time-priority.strategy';
import { AuditTradeVisitor, MetricsTradeVisitor } from './visitors';

/**
 * Matching Module
 * Core engine: order matching (price-time priority), trade execution, order book, lock, observer.
 * Visitor Pattern: AuditTradeVisitor and MetricsTradeVisitor registered as trade observers.
 * Queue Pattern: MatchingQueueService enqueues MATCH_ORDER_JOB; MatchingProcessor consumes.
 *
 * Port bindings:
 *  MATCHING_REPOSITORY        → MatchingRepository
 *  TRADE_AUDIT_LOG_REPOSITORY → TradeAuditLogRepository
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
    { provide: MATCHING_REPOSITORY, useClass: MatchingRepository },
    { provide: TRADE_AUDIT_LOG_REPOSITORY, useClass: TradeAuditLogRepository },
    PriceTimePriorityStrategy,
    MarketOrderStrategy,
    AuditTradeVisitor,
    MetricsTradeVisitor,
    CircuitBreakerService,
    MatchingService,
    MatchingQueueService,
    MatchingProcessor,
  ],
  exports: [
    MatchingService,
    MatchingQueueService,
    MetricsTradeVisitor,
    CircuitBreakerService,
    OrderBookService,
  ],
})
export class MatchingModule {}
