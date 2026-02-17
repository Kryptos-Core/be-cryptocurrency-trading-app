import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BinanceOHLCVProvider } from './providers/binance-ohlcv.provider';
import { UniswapV4OHLCVProvider } from './providers/uniswap-v4-ohlcv.provider';
import { OHLCVProviderRegistry } from './ohlcv-provider.registry';

/**
 * Price Oracle Module
 * Provides on-demand OHLCV by time range (no DB persist).
 * Strategy: Uniswap V4 (primary when configured) + Binance (fallback).
 */
@Module({
  imports: [ConfigModule],
  providers: [BinanceOHLCVProvider, UniswapV4OHLCVProvider, OHLCVProviderRegistry],
  exports: [OHLCVProviderRegistry],
})
export class PriceOracleModule {}
