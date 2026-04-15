import type { MarketPair } from '@/entities/market-pair.entity';
import type { Trade } from '@/entities/trade.entity';
import type { IMarketTickerData } from '../../interfaces/market-ticker.interface';

export interface MarketRepositoryPort {
  findOne(options: {
    where: { pair_id?: string; symbol?: string };
    relations?: string[];
  }): Promise<MarketPair | null>;
  findById(id: string | number): Promise<MarketPair | null>;
  findBySymbol(symbol: string): Promise<MarketPair | null>;
  findByCurrencies(baseCurrencyId: number, quoteCurrencyId: number): Promise<MarketPair | null>;
  findWithPagination(
    page: number,
    limit: number,
    options?: Record<string, unknown>,
  ): Promise<{ data: MarketPair[]; total: number; page: number; limit: number }>;
  findActive(): Promise<MarketPair[]>;
  pairExists(
    baseCurrencyId: string,
    quoteCurrencyId: string,
    excludePairId?: string,
  ): Promise<boolean>;
  symbolExists(symbol: string, excludePairId?: string): Promise<boolean>;
  create(entity: Partial<MarketPair>): Promise<MarketPair>;
  update(id: string | number, entity: Partial<MarketPair>): Promise<MarketPair>;
  delete(id: string | number): Promise<void>;
  getOrderBook(pairId: string, limit?: number): Promise<{ bids: unknown[]; asks: unknown[] }>;
  getTicker(pairId: string): Promise<IMarketTickerData>;
  getRecentTrades(pairId: string, limit?: number): Promise<Trade[]>;
}
