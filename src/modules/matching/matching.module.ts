import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
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

/**
 * Matching Module
 * Core engine: order matching (price-time priority), trade execution, order book, lock, observer.
 * Visitor Pattern: AuditTradeVisitor and MetricsTradeVisitor registered as trade observers.
 */
@Module({
  imports: [TypeOrmModule.forFeature([TradeAuditLog])],
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
  ],
  exports: [MatchingService, MetricsTradeVisitor, CircuitBreakerService],
})
export class MatchingModule {}
