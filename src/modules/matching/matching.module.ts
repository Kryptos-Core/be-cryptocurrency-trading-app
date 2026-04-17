import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TradeAuditLog } from '@/entities/trade-audit-log.entity';
import {
  EnqueueMatchUseCase,
  ReconcileOpenOrdersForPairUseCase,
  RemoveOrderFromBookUseCase,
  RunMatchUseCase,
} from './application/use-cases';
import { MATCHING_REPOSITORY, TRADE_AUDIT_LOG_REPOSITORY } from './domain/ports';
import {
  BuyQueueService,
  CircuitBreakerService,
  MarketOrderStrategy,
  MatchingService,
  OrderBookService,
  PriceTimePriorityStrategy,
  SellQueueService,
} from './domain/services';
import { AuditTradeVisitor, MetricsTradeVisitor } from './infrastructure/observers';
import { MatchingRepository, TradeAuditLogRepository } from './infrastructure/persistence';
import { MATCHING_QUEUE, MatchingProcessor, MatchingQueueService } from './infrastructure/queue';

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
    EnqueueMatchUseCase,
    RunMatchUseCase,
    RemoveOrderFromBookUseCase,
    ReconcileOpenOrdersForPairUseCase,
    MatchingProcessor,
  ],
  exports: [
    EnqueueMatchUseCase,
    RunMatchUseCase,
    RemoveOrderFromBookUseCase,
    ReconcileOpenOrdersForPairUseCase,
    MetricsTradeVisitor,
    CircuitBreakerService,
    OrderBookService,
  ],
})
export class MatchingModule {}
