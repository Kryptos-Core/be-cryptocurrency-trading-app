import { BullModule } from '@nestjs/bull';
import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OutboxModule } from '@/common/outbox/outbox.module';
import { TradeAuditLog } from '@/entities/trade-audit-log.entity';
import { ExchangeRateModule } from '@/modules/exchange-rate/exchange-rate.module';
import { ORDER_MATCHING_GATEWAY } from '@/modules/orders/domain/ports/order-matching-gateway.port';
import { SystemConfigModule } from '@/modules/system-config/system-config.module';
import {
  EnqueueMatchUseCase,
  MatchingShadowReconciliationUseCase,
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
  TradingPriceValidatorService,
} from './domain/services';
import { OrderMatchingGatewayAdapter } from './infrastructure/adapters';
import { AuditTradeVisitor, MetricsTradeVisitor } from './infrastructure/observers';
import { MatchingRepository, TradeAuditLogRepository } from './infrastructure/persistence';
import { MATCHING_QUEUE, MatchingProcessor, MatchingQueueService } from './infrastructure/queue';

@Module({
  imports: [
    TypeOrmModule.forFeature([TradeAuditLog]),
    forwardRef(() => OutboxModule),
    BullModule.registerQueue({ name: MATCHING_QUEUE }),
    SystemConfigModule,
    ExchangeRateModule,
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
    TradingPriceValidatorService,
    MatchingService,
    MatchingQueueService,
    EnqueueMatchUseCase,
    RunMatchUseCase,
    RemoveOrderFromBookUseCase,
    ReconcileOpenOrdersForPairUseCase,
    MatchingShadowReconciliationUseCase,
    OrderMatchingGatewayAdapter,
    {
      provide: ORDER_MATCHING_GATEWAY,
      useExisting: OrderMatchingGatewayAdapter,
    },
    MatchingProcessor,
  ],
  exports: [
    ORDER_MATCHING_GATEWAY,
    EnqueueMatchUseCase,
    RunMatchUseCase,
    RemoveOrderFromBookUseCase,
    ReconcileOpenOrdersForPairUseCase,
    MatchingShadowReconciliationUseCase,
    MetricsTradeVisitor,
    CircuitBreakerService,
    OrderBookService,
  ],
})
export class MatchingModule {}
