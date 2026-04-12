import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MarketPair } from '@/entities/market-pair.entity';
import { CurrenciesModule } from '@/modules/currencies/currencies.module';
import { MatchingModule } from '@/modules/matching/matching.module';
import { PriceOracleModule } from '@/modules/price-oracle/price-oracle.module';
import { MarketsController } from './markets.controller';
import { MarketsService } from './markets.service';
import { MarketRepository } from './repositories';

/**
 * Markets Module
 * Module Pattern: Encapsulate markets feature
 * OHLCV/ticker from Price Oracle (on-demand; no DB persist).
 * Depth snapshot: delegates to OrderBookService (from MatchingModule) for real-time in-memory depth.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([MarketPair]),
    forwardRef(() => CurrenciesModule),
    PriceOracleModule,
    forwardRef(() => MatchingModule),
  ],
  providers: [MarketsService, MarketRepository],
  controllers: [MarketsController],
  exports: [MarketsService, MarketRepository],
})
export class MarketsModule {}
