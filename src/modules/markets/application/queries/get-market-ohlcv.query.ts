import { Injectable } from '@nestjs/common';
import { MarketsService } from '../../markets.service';

/**
 * GetMarketOHLCVQuery — read-only query for OHLCV candlestick data.
 * Delegates to MarketsService; use this from controllers instead of calling the service directly.
 */
@Injectable()
export class GetMarketOHLCVQuery {
  constructor(private readonly marketsService: MarketsService) {}

  async getOHLCV(params: {
    pairId: string;
    limit?: number;
    range?: string;
    locale?: string;
    interval?: string;
  }): Promise<Record<string, unknown>> {
    return this.marketsService.getOHLCV(
      params.pairId,
      params.limit ?? 100,
      params.range,
      params.locale ?? 'en',
      params.interval,
    );
  }
}
