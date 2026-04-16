import { Injectable } from '@nestjs/common';
import type { MarketPair } from '@/entities/market-pair.entity';
import type { MarketTickerDto } from '../../dto';
import { MarketsService } from '../../markets.service';

/**
 * GetMarketPairQuery — read-only query for market pair data.
 * Delegates to MarketsService; use this from controllers instead of calling the service directly.
 */
@Injectable()
export class GetMarketPairQuery {
  constructor(private readonly marketsService: MarketsService) {}

  async findAll(params: {
    page?: number;
    limit?: number;
    includeInactive?: boolean;
    includeTickers?: boolean;
    search?: string | null;
    baseSymbol?: string | null;
    quoteSymbol?: string | null;
    quoteSymbols?: string | null;
    sortBy?: string | null;
    sortOrder?: string | null;
    fuzzySearch?: boolean;
  }): Promise<{
    pairs: MarketPair[];
    total: number;
    page: number;
    limit: number;
    tickers?: MarketTickerDto[];
  }> {
    return this.marketsService.findAll(
      params.page ?? 1,
      params.limit ?? 10,
      params.includeInactive ?? false,
      params.includeTickers ?? false,
      params.search ?? null,
      params.baseSymbol ?? null,
      params.quoteSymbol ?? null,
      params.quoteSymbols ?? null,
      params.sortBy ?? null,
      params.sortOrder ?? null,
      params.fuzzySearch ?? false,
    );
  }

  async findOne(pairId: string): Promise<MarketPair> {
    return this.marketsService.findOne(pairId);
  }

  async findBySymbol(symbol: string): Promise<MarketPair> {
    return this.marketsService.findBySymbol(symbol);
  }

  async findActive(): Promise<MarketPair[]> {
    return this.marketsService.findActive();
  }
}
