import { Injectable } from '@nestjs/common';
import { IOHLCVProvider, OHLCVCandleDto } from './interfaces/ohlcv-provider.interface';
import { BinanceOHLCVProvider } from './providers/binance-ohlcv.provider';

/**
 * Registry of OHLCV providers. Binance-only for free demo (no Uniswap/The Graph).
 * Dependency Inversion: depends on IOHLCVProvider abstraction.
 */
@Injectable()
export class OHLCVProviderRegistry implements IOHLCVProvider {
  readonly name = 'registry';

  constructor(private readonly binanceProvider: BinanceOHLCVProvider) {}

  async getOHLCVByRange(
    pairId: string,
    symbol: string,
    intervalSec: number,
    fromDate: Date,
    toDate: Date,
    limit: number,
  ): Promise<OHLCVCandleDto[]> {
    return this.binanceProvider.getOHLCVByRange(
      pairId,
      symbol,
      intervalSec,
      fromDate,
      toDate,
      limit,
    );
  }
}
