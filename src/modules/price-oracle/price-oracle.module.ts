import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BinanceOHLCVProvider } from './providers/binance-ohlcv.provider';
import { OHLCVProviderRegistry } from './ohlcv-provider.registry';

/**
 * Price Oracle Module
 * Provides on-demand OHLCV by time range (no DB persist).
 * Binance only – free demo, no Uniswap/The Graph.
 */
@Module({
  imports: [ConfigModule],
  providers: [BinanceOHLCVProvider, OHLCVProviderRegistry],
  exports: [OHLCVProviderRegistry],
})
export class PriceOracleModule {}
