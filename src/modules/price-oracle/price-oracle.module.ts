import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BinanceOHLCVProvider } from './providers/binance-ohlcv.provider';

/**
 * Price Oracle Module
 * Provides on-demand OHLCV by time range (no DB persist).
 * Binance only – on-demand OHLCV by time range.
 */
@Module({
  imports: [ConfigModule],
  providers: [BinanceOHLCVProvider],
  exports: [BinanceOHLCVProvider],
})
export class PriceOracleModule {}
