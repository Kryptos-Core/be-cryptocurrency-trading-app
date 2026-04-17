import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GetPriceOracleProviderIdQuery } from './application/queries/get-price-oracle-provider-id.query';
import { BinanceOHLCVProvider } from './providers/binance-ohlcv.provider';

/**
 * Price Oracle Module
 * Provides on-demand OHLCV by time range (no DB persist).
 * Binance only – on-demand OHLCV by time range.
 */
@Module({
  imports: [ConfigModule],
  providers: [BinanceOHLCVProvider, GetPriceOracleProviderIdQuery],
  exports: [BinanceOHLCVProvider, GetPriceOracleProviderIdQuery],
})
export class PriceOracleModule {}
