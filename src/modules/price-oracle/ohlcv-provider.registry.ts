import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IOHLCVProvider, OHLCVCandleDto } from './interfaces/ohlcv-provider.interface';
import { BinanceOHLCVProvider } from './providers/binance-ohlcv.provider';
import { UniswapV3OHLCVProvider } from './providers/uniswap-v3-ohlcv.provider';

/**
 * Registry of OHLCV providers with fallback (Strategy + Composite).
 * Primary: Uniswap V3 when symbol is configured; Fallback: Binance.
 * Dependency Inversion: depends on IOHLCVProvider abstractions.
 */
@Injectable()
export class OHLCVProviderRegistry implements IOHLCVProvider {
  readonly name = 'registry';

  private readonly providers: IOHLCVProvider[];
  private readonly uniswapSymbols: Set<string>;

  constructor(
    private readonly configService: ConfigService,
    private readonly binanceProvider: BinanceOHLCVProvider,
    private readonly uniswapProvider: UniswapV3OHLCVProvider,
  ) {
    this.providers = [uniswapProvider, binanceProvider];
    const symbolToPoolId =
      this.configService.get<Record<string, string>>('app.priceOracle.uniswap.symbolToPoolId') || {};
    this.uniswapSymbols = new Set([
      ...Object.keys(symbolToPoolId),
      ...Object.keys(symbolToPoolId).map((s) => s.toUpperCase().replace(/[^A-Z0-9]/g, '')),
    ]);
  }

  async getOHLCVByRange(
    pairId: string,
    symbol: string,
    intervalSec: number,
    fromDate: Date,
    toDate: Date,
    limit: number,
  ): Promise<OHLCVCandleDto[]> {
    const normalized = this.normalizeSymbol(symbol);
    const tryUniswapFirst = this.uniswapSymbols.has(symbol) || this.uniswapSymbols.has(normalized);

    if (tryUniswapFirst) {
      const candles = await this.uniswapProvider.getOHLCVByRange(
        pairId,
        symbol,
        intervalSec,
        fromDate,
        toDate,
        limit,
      );
      if (candles.length > 0) return candles;
    }

    return this.binanceProvider.getOHLCVByRange(
      pairId,
      symbol,
      intervalSec,
      fromDate,
      toDate,
      limit,
    );
  }

  private normalizeSymbol(symbol: string): string {
    return String(symbol).toUpperCase().replace(/[^A-Z0-9]/g, '');
  }
}
