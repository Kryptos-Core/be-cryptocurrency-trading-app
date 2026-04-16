import { Injectable } from '@nestjs/common';
import type { MarketTickerDto } from '../../dto';
import { MarketsService } from '../../markets.service';

/**
 * GetMarketTickerQuery — read-only query for market ticker data.
 * Delegates to MarketsService; use this from controllers instead of calling the service directly.
 */
@Injectable()
export class GetMarketTickerQuery {
  constructor(private readonly marketsService: MarketsService) {}

  async getTicker(pairId: string): Promise<MarketTickerDto> {
    return this.marketsService.getTicker(pairId);
  }

  async getTickerBySymbol(symbol: string): Promise<MarketTickerDto> {
    return this.marketsService.getTickerBySymbol(symbol);
  }

  async getAllTickers(): Promise<MarketTickerDto[]> {
    return this.marketsService.getAllTickers();
  }

  async getTickersForBaseSymbols(baseSymbols: string[]): Promise<MarketTickerDto[]> {
    return this.marketsService.getTickersForBaseSymbols(baseSymbols);
  }
}
