import type { TransactionContext } from '@/common/types/transaction-context';
import type { MarketPair } from '@/entities/market-pair.entity';
import type { Trade } from '@/entities/trade.entity';
import type { MarketPairRecord } from '@/modules/markets/contracts';
import type { IMarketTickerData } from '../../interfaces/market-ticker.interface';

export type MarketRepositoryOrderBookLevel = {
  price: string;
  amount: string;
  orders: number;
};

export type MarketRepositoryFilterOptions = {
  includeInactive?: boolean;
  search?: string;
  baseSymbol?: string;
  quoteSymbol?: string;
  quoteSymbols?: string[];
  sortBy?: 'symbol' | 'base' | 'quote' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
  fuzzySearch?: boolean;
};

export interface MarketRepositoryPort {
  findOne(options: {
    where: { pair_id?: string; symbol?: string };
    relations?: string[];
  }): Promise<MarketPairRecord | null>;
  findById(id: string | number): Promise<MarketPairRecord | null>;
  findBySymbol(symbol: string): Promise<MarketPairRecord | null>;
  findByCurrencies(
    baseCurrencyId: number,
    quoteCurrencyId: number,
  ): Promise<MarketPairRecord | null>;
  findWithPagination(
    page: number,
    limit: number,
    options?: MarketRepositoryFilterOptions,
  ): Promise<{ data: MarketPairRecord[]; total: number; page: number; limit: number }>;
  findActive(): Promise<MarketPairRecord[]>;
  pairExists(
    baseCurrencyId: string,
    quoteCurrencyId: string,
    excludePairId?: string,
  ): Promise<boolean>;
  symbolExists(symbol: string, excludePairId?: string): Promise<boolean>;
  create(entity: Partial<MarketPair>): Promise<MarketPair>;
  /** Same as {@link create} but participates in an active TypeORM transaction. */
  createWithinTransaction(
    ctx: TransactionContext,
    entity: Partial<MarketPair>,
  ): Promise<MarketPair>;
  update(id: string | number, entity: Partial<MarketPair>): Promise<MarketPair>;
  updateWithinTransaction(
    ctx: TransactionContext,
    id: string | number,
    entity: Partial<MarketPair>,
  ): Promise<MarketPair>;
  delete(id: string | number): Promise<void>;
  getOrderBook(
    pairId: string,
    limit?: number,
  ): Promise<{ bids: MarketRepositoryOrderBookLevel[]; asks: MarketRepositoryOrderBookLevel[] }>;
  getTicker(pairId: string): Promise<IMarketTickerData>;
  getRecentTrades(pairId: string, limit?: number): Promise<Trade[]>;
}
