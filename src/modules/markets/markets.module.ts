import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MarketPair } from '@/entities/market-pair.entity';
import { CurrenciesModule } from '@/modules/currencies/currencies.module';
import { MatchingModule } from '@/modules/matching/matching.module';
import { PriceOracleModule } from '@/modules/price-oracle/price-oracle.module';
import {
  GetMarketDepthQuery,
  GetMarketOHLCVQuery,
  GetMarketPairQuery,
  GetMarketTickerQuery,
} from './application/queries';
import {
  CreateMarketPairUseCase,
  DeleteMarketPairUseCase,
  UpdateMarketPairUseCase,
} from './application/use-cases';
import { MARKET_REPOSITORY } from './domain/ports';
import { MarketsController } from './markets.controller';
import { MarketsService } from './markets.service';
import { MarketRepository } from './repositories';

@Module({
  imports: [
    TypeOrmModule.forFeature([MarketPair]),
    forwardRef(() => CurrenciesModule),
    PriceOracleModule,
    forwardRef(() => MatchingModule),
  ],
  providers: [
    MarketRepository,
    {
      provide: MARKET_REPOSITORY,
      useExisting: MarketRepository,
    },
    MarketsService,
    // Use cases
    CreateMarketPairUseCase,
    UpdateMarketPairUseCase,
    DeleteMarketPairUseCase,
    // Queries
    GetMarketPairQuery,
    GetMarketTickerQuery,
    GetMarketDepthQuery,
    GetMarketOHLCVQuery,
  ],
  controllers: [MarketsController],
  exports: [MarketsService, MARKET_REPOSITORY, MarketRepository],
})
export class MarketsModule {}
