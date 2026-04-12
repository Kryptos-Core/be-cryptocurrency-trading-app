import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { OHLCVProviderRegistry } from './ohlcv-provider.registry';
import { BinanceOHLCVProvider } from './providers/binance-ohlcv.provider';

/**
 * Price Oracle Module
 * Provides on-demand OHLCV by time range (no DB persist).
 * Binance only – on-demand OHLCV by time range.
 */
@Module({
  imports: [ConfigModule],
  providers: [BinanceOHLCVProvider, OHLCVProviderRegistry],
  exports: [OHLCVProviderRegistry],
})
export class PriceOracleModule {}
