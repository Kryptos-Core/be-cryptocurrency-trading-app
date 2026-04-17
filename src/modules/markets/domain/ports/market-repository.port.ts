import type { MarketPairRecord } from '@/modules/markets/contracts';
import type { Trade } from '@/entities/trade.entity';
import type { IMarketTickerData } from '../../interfaces/market-ticker.interface';

export interface MarketRepositoryPort {
  findOne(options: {
    where: { pair_id?: string; symbol?: string };
    relations?: string[];
  }): Promise<MarketPairRecord | null>;
  findById(id: string | number): Promise<MarketPairRecord | null>;
  findBySymbol(symbol: string): Promise<MarketPairRecord | null>;
  findByCurrencies(baseCurrencyId: number, quoteCurrencyId: number): Promise<MarketPairRecord | null>;
  findWithPagination(
    page: number,
    limit: number,
    options?: Record<string, unknown>,
  ): Promise<{ data: MarketPairRecord[]; total: number; page: number; limit: number }>;
  findActive(): Promise<MarketPairRecord[]>;
  pairExists(
    baseCurrencyId: string,
    quoteCurrencyId: string,
    excludePairId?: string,
  ): Promise<boolean>;
  symbolExists(symbol: string, excludePairId?: string): Promise<boolean>;
  create(entity: Partial<MarketPairRecord>): Promise<MarketPairRecord>;
  update(id: string | number, entity: Partial<MarketPairRecord>): Promise<MarketPairRecord>;
  delete(id: string | number): Promise<void>;
  getOrderBook(pairId: string, limit?: number): Promise<{ bids: unknown[]; asks: unknown[] }>;
  getTicker(pairId: string): Promise<IMarketTickerData>;
  getRecentTrades(pairId: string, limit?: number): Promise<Trade[]>;
}



