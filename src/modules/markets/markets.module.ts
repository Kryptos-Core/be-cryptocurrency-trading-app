import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MarketsService } from './markets.service';
import { MarketsController } from './markets.controller';
import { MarketRepository } from './repositories';
import { MarketPair } from '@/entities/market-pair.entity';
import { CurrenciesModule } from '@/modules/currencies/currencies.module';
import { PriceOracleModule } from '@/modules/price-oracle/price-oracle.module';

/**
 * Markets Module
 * Module Pattern: Encapsulate markets feature
 * OHLCV/ticker from Price Oracle (on-demand; no DB persist).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([MarketPair]),
    CurrenciesModule,
    PriceOracleModule,
  ],
  providers: [MarketsService, MarketRepository],
  controllers: [MarketsController],
  exports: [MarketsService, MarketRepository],
})
export class MarketsModule {}
