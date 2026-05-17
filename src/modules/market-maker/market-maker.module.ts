import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MarketMakerConfig } from '@/entities/market-maker-config.entity';
import { MarketsModule } from '@/modules/markets/markets.module';
import { OrdersModule } from '@/modules/orders/orders.module';
import { SystemConfigModule } from '@/modules/system-config/system-config.module';
import { GetMarketMakerQuery } from './application/queries';
import {
  DeleteMarketMakerConfigUseCase,
  PlaceMakerOrdersUseCase,
  RefreshMakerOrdersUseCase,
  UpsertMarketMakerConfigUseCase,
} from './application/use-cases';
import { MARKET_MAKER_CONFIG_REPOSITORY } from './domain/ports';
import { MarketMakerController } from './market-maker.controller';
import { MarketMakerService } from './market-maker.service';
import { MarketMakerConfigRepository } from './repositories';
import { MmOrderStrategyService } from './services/mm-order-strategy.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([MarketMakerConfig]),
    forwardRef(() => MarketsModule),
    OrdersModule,
    SystemConfigModule,
  ],
  controllers: [MarketMakerController],
  providers: [
    MarketMakerConfigRepository,
    {
      provide: MARKET_MAKER_CONFIG_REPOSITORY,
      useExisting: MarketMakerConfigRepository,
    },
    MarketMakerService,
    MmOrderStrategyService,
    // Queries
    GetMarketMakerQuery,
    // Use-cases
    UpsertMarketMakerConfigUseCase,
    DeleteMarketMakerConfigUseCase,
    PlaceMakerOrdersUseCase,
    RefreshMakerOrdersUseCase,
  ],
  exports: [MarketMakerService],
})
export class MarketMakerModule {}
