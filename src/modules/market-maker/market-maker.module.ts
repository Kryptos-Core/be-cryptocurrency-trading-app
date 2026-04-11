import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MarketMakerConfig } from '@/entities/market-maker-config.entity';
import { MarketsModule } from '@/modules/markets/markets.module';
import { OrdersModule } from '@/modules/orders/orders.module';
import { SystemConfigModule } from '@/modules/system-config/system-config.module';
import { MarketMakerController } from './market-maker.controller';
import { MarketMakerService } from './market-maker.service';
import { MarketMakerConfigRepository } from './repositories';
import { MmOrderStrategyService } from './services/mm-order-strategy.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([MarketMakerConfig]),
    MarketsModule,
    OrdersModule,
    SystemConfigModule,
  ],
  controllers: [MarketMakerController],
  providers: [MarketMakerService, MarketMakerConfigRepository, MmOrderStrategyService],
  exports: [MarketMakerService],
})
export class MarketMakerModule {}
