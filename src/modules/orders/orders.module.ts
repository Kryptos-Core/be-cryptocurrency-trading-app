import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from '@/entities/order.entity';
import { MarketsModule } from '@/modules/markets/markets.module';
import { MatchingModule } from '@/modules/matching/matching.module';
import { WalletsModule } from '@/modules/wallets/wallets.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { OrderRepository } from './repositories';
import { OrderValidationStrategy } from './strategies';

/**
 * Orders Module
 * Module Pattern: Encapsulate order management (create, cancel, order book).
 * Repository + Service Layer + Command + State + Idempotency patterns.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Order]), MarketsModule, WalletsModule, MatchingModule],
  providers: [OrdersService, OrderRepository, OrderValidationStrategy],
  controllers: [OrdersController],
  exports: [OrdersService, OrderRepository],
})
export class OrdersModule {}
