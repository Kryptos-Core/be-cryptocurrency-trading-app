import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from '@/entities/order.entity';
import { MarketsModule } from '@/modules/markets/markets.module';
import { MatchingModule } from '@/modules/matching/matching.module';
import { WalletsModule } from '@/modules/wallets/wallets.module';
import { FindMyOrdersQuery } from '@/modules/orders/application/queries/find-my-orders.query';
import { ListOpenOrdersForPairQuery } from '@/modules/orders/application/queries/list-open-orders-for-pair.query';
import { CancelOrderUseCase } from '@/modules/orders/application/use-cases/cancel-order.use-case';
import { CreateOrderUseCase } from '@/modules/orders/application/use-cases/create-order.use-case';
import { ReconcileMatchingForPairUseCase } from '@/modules/orders/application/use-cases/reconcile-matching-for-pair.use-case';
import { PrepareCreateOrderContextService } from '@/modules/orders/application/services/prepare-create-order-context.service';
import { OrderReservePolicy } from '@/modules/orders/domain/services/order-reserve-policy.service';
import { OrderValidationService } from '@/modules/orders/domain/services/order-validation.service';
import { OrderValidationStrategy } from '@/modules/orders/strategies';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { OrderRepository } from './repositories';

@Module({
  imports: [TypeOrmModule.forFeature([Order]), MarketsModule, WalletsModule, MatchingModule],
  providers: [
    OrdersService,
    OrderRepository,
    OrderValidationService,
    {
      provide: OrderValidationStrategy,
      useExisting: OrderValidationService,
    },
    OrderReservePolicy,
    PrepareCreateOrderContextService,
    CreateOrderUseCase,
    CancelOrderUseCase,
    ListOpenOrdersForPairQuery,
    FindMyOrdersQuery,
    ReconcileMatchingForPairUseCase,
  ],
  controllers: [OrdersController],
  exports: [OrdersService, OrderRepository],
})
export class OrdersModule {}
