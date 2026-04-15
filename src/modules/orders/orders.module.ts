import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from '@/entities/order.entity';
import { MarketsModule } from '@/modules/markets/markets.module';
import { MatchingModule } from '@/modules/matching/matching.module';
import { FindAllOrdersAdminQuery } from '@/modules/orders/application/queries/find-all-orders-admin.query';
import { FindMyOrdersQuery } from '@/modules/orders/application/queries/find-my-orders.query';
import { FindOneOrderQuery } from '@/modules/orders/application/queries/find-one-order.query';
import { FindOrdersByUserQuery } from '@/modules/orders/application/queries/find-orders-by-user.query';
import { GetOrderBookQuery } from '@/modules/orders/application/queries/get-order-book.query';
import { ListOpenOrdersForPairQuery } from '@/modules/orders/application/queries/list-open-orders-for-pair.query';
import { PrepareCreateOrderContextService } from '@/modules/orders/application/services/prepare-create-order-context.service';
import { CancelOrderUseCase } from '@/modules/orders/application/use-cases/cancel-order.use-case';
import { CreateOrderUseCase } from '@/modules/orders/application/use-cases/create-order.use-case';
import { ReconcileMatchingForPairUseCase } from '@/modules/orders/application/use-cases/reconcile-matching-for-pair.use-case';
import { ORDER_REPOSITORY } from '@/modules/orders/domain/ports';
import { OrderReservePolicy } from '@/modules/orders/domain/services/order-reserve-policy.service';
import { OrderValidationService } from '@/modules/orders/domain/services/order-validation.service';
import { OrderRepositoryImpl } from '@/modules/orders/infrastructure/persistence/order.repository.impl';
import { OrderValidationStrategy } from '@/modules/orders/strategies';
import { WalletsModule } from '@/modules/wallets/wallets.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [TypeOrmModule.forFeature([Order]), MarketsModule, WalletsModule, MatchingModule],
  providers: [
    // --- Infrastructure: port bindings ---
    {
      provide: ORDER_REPOSITORY,
      useClass: OrderRepositoryImpl,
    },
    // Legacy alias so external modules importing OrderRepository still resolve.
    // TODO: migrate external consumers to ORDER_REPOSITORY port, then remove.
    {
      provide: OrderRepositoryImpl,
      useExisting: ORDER_REPOSITORY,
    },

    // --- Domain services ---
    OrderValidationService,
    {
      provide: OrderValidationStrategy,
      useExisting: OrderValidationService,
    },
    OrderReservePolicy,

    // --- Application: use cases & queries ---
    PrepareCreateOrderContextService,
    CreateOrderUseCase,
    CancelOrderUseCase,
    ReconcileMatchingForPairUseCase,
    FindMyOrdersQuery,
    FindOneOrderQuery,
    FindAllOrdersAdminQuery,
    FindOrdersByUserQuery,
    GetOrderBookQuery,
    ListOpenOrdersForPairQuery,

    // --- Facade ---
    OrdersService,
  ],
  controllers: [OrdersController],
  exports: [OrdersService, ORDER_REPOSITORY],
})
export class OrdersModule {}
