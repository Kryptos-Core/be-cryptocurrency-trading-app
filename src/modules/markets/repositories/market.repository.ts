import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { MARKET_STORE_PROCEDURE } from '@/common/constants/stored-procedure-names';
import { BaseRepository } from '@/common/repositories';
import { calcSkip } from '@/common/utils/pagination.util';
import { newUuid } from '@/common/utils/uuid.util';
import { MarketPair } from '@/entities/market-pair.entity';
import { Trade } from '@/entities/trade.entity';
import type { IMarketTickerData } from '../interfaces/market-ticker.interface';

/**
 * Market Repository
 * Repository Pattern: Data access abstraction for market pairs
 * Extends BaseRepository: Inherits CRUD operations
 * Database Procedure Pattern: Uses stored procedures for database operations
 * Complex Queries: Custom methods for market-specific queries
 */
@Injectable()
export class MarketRepository extends BaseRepository<MarketPair> {
  constructor(dataSource: DataSource) {
    super(MarketPair, dataSource);
  }

  /**
   * Override findOne to use stored procedure
   * Database Procedure Pattern: sp_market_find_by_id
   * Supports finding by pair_id or other options
   */
  async findOne(options: any): Promise<MarketPair | null> {
    // If options has a where clause with pair_id, use it
    if (options?.where?.pair_id !== undefined) {
      const id = options.where.pair_id;
      const result = await this.dataSource.query(`CALL ${MARKET_STORE_PROCEDURE.FIND_BY_ID}(?)`, [
        id,
      ]);
      if (!result || result.length === 0 || !result[0] || result[0].length === 0) {
        return null;
      }
      return this.mapProcedureResultToEntity(result[0][0]);
    }

    // Fallback: try to find by using the parent implementation
    // This is a safety measure, but normally we should have pair_id in the where clause
    if (options?.where?.symbol !== undefined) {
      return this.findBySymbol(options.where.symbol);
    }

    // If neither pair_id nor symbol is provided, return null
    return null;
  }

  /**
   * Override findById to use stored procedure
   * Database Procedure Pattern: sp_market_find_by_id
   */
  async findById(id: number | string): Promise<MarketPair | null> {
    const result = await this.dataSource.query(`CALL ${MARKET_STORE_PROCEDURE.FIND_BY_ID}(?)`, [
      id,
    ]);
    if (!result || result.length === 0 || !result[0] || result[0].length === 0) {
      return null;
    }
    return this.mapProcedureResultToEntity(result[0][0]);
  }

  /**
   * Find market pair by symbol using stored procedure
   * Database Procedure Pattern: sp_market_find_by_symbol
   */
  async findBySymbol(symbol: string): Promise<MarketPair | null> {
    const result = await this.dataSource.query(`CALL ${MARKET_STORE_PROCEDURE.FIND_BY_SYMBOL}(?)`, [
      symbol.toUpperCase(),
    ]);
    if (!result || result.length === 0 || !result[0] || result[0].length === 0) {
      return null;
    }
    return this.mapProcedureResultToEntity(result[0][0]);
  }

  /**
   * Find market pair by base and quote currency IDs
   * Database Procedure Pattern: sp_market_find_by_currencies
   */
  async findByCurrencies(
    baseCurrencyId: number,
    quoteCurrencyId: number,
  ): Promise<MarketPair | null> {
    const result = await this.dataSource.query(
      `CALL ${MARKET_STORE_PROCEDURE.FIND_BY_CURRENCIES}(?, ?)`,
      [baseCurrencyId, quoteCurrencyId],
    );
    if (!result || result.length === 0 || !result[0] || result[0].length === 0) {
      return null;
    }
    return this.mapProcedureResultToEntity(result[0][0]);
  }

  /**
   * Override findAll to use stored procedure
   * Database Procedure Pattern: sp_market_find_all
   */
  async findAll(
    page: number = 1,
    limit: number = 10,
    includeInactive: boolean = false,
  ): Promise<{ data: MarketPair[]; total: number; page: number; limit: number }> {
    const skip = calcSkip(page, limit);
    const result = await this.dataSource.query(`CALL ${MARKET_STORE_PROCEDURE.FIND_ALL}(?, ?, ?)`, [
      skip,
      limit,
      includeInactive,
    ]);

    // Get total count using stored procedure
    await this.dataSource.query(`CALL ${MARKET_STORE_PROCEDURE.COUNT}(?, @total)`, [
      includeInactive,
    ]);
    const totalResult = await this.dataSource.query('SELECT @total as total');
    const total = totalResult[0]?.total || 0;

    const data = result[0]?.map((row: any) => this.mapProcedureResultToEntity(row)) || [];

    return {
      data,
      total,
      page,
      limit,
    };
  }

  /**
   * Find all with optional search and filter (Database Procedure Pattern: sp_market_find_all_filtered)
   * Used when search or baseSymbol or quoteSymbol is provided.
   */
  async findAllWithFilter(
    page: number = 1,
    limit: number = 10,
    options: {
      includeInactive?: boolean;
      search?: string | null;
      baseSymbol?: string | null;
      quoteSymbol?: string | null;
    } = {},
  ): Promise<{ data: MarketPair[]; total: number; page: number; limit: number }> {
    const skip = calcSkip(page, limit);
    const includeInactive = options.includeInactive ?? false;
    const search = options.search?.trim() || null;
    const baseSymbol = options.baseSymbol?.trim() || null;
    const quoteSymbol = options.quoteSymbol?.trim() || null;

    const result = await this.dataSource.query(
      `CALL ${MARKET_STORE_PROCEDURE.FIND_ALL_FILTERED}(?, ?, ?, ?, ?, ?)`,
      [skip, limit, includeInactive, search, baseSymbol, quoteSymbol],
    );

    await this.dataSource.query(
      `CALL ${MARKET_STORE_PROCEDURE.COUNT_FILTERED}(?, ?, ?, ?, @total)`,
      [includeInactive, search, baseSymbol, quoteSymbol],
    );
    const totalResult = await this.dataSource.query('SELECT @total as total');
    const total = totalResult[0]?.total || 0;

    const data = result[0]?.map((row: any) => this.mapProcedureResultToEntity(row)) || [];
    return { data, total, page, limit };
  }

  /**
   * Override findWithPagination to use stored procedures.
   * Uses sp_market_find_all_filtered when search/baseSymbol/quoteSymbol provided; otherwise sp_market_find_all.
   */
  async findWithPagination(
    page: number = 1,
    limit: number = 10,
    options?: any,
  ): Promise<{ data: MarketPair[]; total: number; page: number; limit: number }> {
    const hasAdvancedOptions =
      (Array.isArray(options?.quoteSymbols) && options.quoteSymbols.length > 0) ||
      options?.sortBy != null ||
      options?.sortOrder != null ||
      options?.fuzzySearch === true;

    if (hasAdvancedOptions) {
      return this.findAllWithAdvancedQuery(page, limit, {
        includeInactive: options?.includeInactive ?? false,
        search: options?.search ?? null,
        baseSymbol: options?.baseSymbol ?? null,
        quoteSymbol: options?.quoteSymbol ?? null,
        quoteSymbols: Array.isArray(options?.quoteSymbols) ? options.quoteSymbols : [],
        sortBy: options?.sortBy ?? 'symbol',
        sortOrder: options?.sortOrder ?? 'asc',
        fuzzySearch: options?.fuzzySearch === true,
      });
    }

    const hasFilter =
      (options?.search != null && String(options.search).trim() !== '') ||
      (options?.baseSymbol != null && String(options.baseSymbol).trim() !== '') ||
      (options?.quoteSymbol != null && String(options.quoteSymbol).trim() !== '');

    if (hasFilter) {
      return this.findAllWithFilter(page, limit, {
        includeInactive: options?.includeInactive ?? false,
        search: options?.search ?? null,
        baseSymbol: options?.baseSymbol ?? null,
        quoteSymbol: options?.quoteSymbol ?? null,
      });
    }
    return this.findAll(page, limit, options?.includeInactive ?? false);
  }

  private async findAllWithAdvancedQuery(
    page: number,
    limit: number,
    options: {
      includeInactive?: boolean;
      search?: string | null;
      baseSymbol?: string | null;
      quoteSymbol?: string | null;
      quoteSymbols?: string[];
      sortBy?: 'symbol' | 'base' | 'quote' | 'createdAt';
      sortOrder?: 'asc' | 'desc';
      fuzzySearch?: boolean;
    },
  ): Promise<{ data: MarketPair[]; total: number; page: number; limit: number }> {
    const skip = calcSkip(page, limit);
    const includeInactive = options.includeInactive ?? false;
    const search = options.search?.trim() ? options.search.trim().toUpperCase() : null;
    const baseSymbol = options.baseSymbol?.trim() ? options.baseSymbol.trim().toUpperCase() : null;
    const quoteSymbol = options.quoteSymbol?.trim()
      ? options.quoteSymbol.trim().toUpperCase()
      : null;
    const quoteSymbols = (options.quoteSymbols ?? [])
      .map((item) => item.trim().toUpperCase())
      .filter(Boolean);
    const quoteSymbolsCsv = quoteSymbols.length > 0 ? quoteSymbols.join(',') : null;

    const sortByParam =
      options.sortBy === 'createdAt' ? 'createdat' : (options.sortBy ?? 'symbol').toLowerCase();
    const sortOrder = options.sortOrder === 'desc' ? 'desc' : 'asc';
    const fuzzySearch = options.fuzzySearch === true;

    const result = await this.dataSource.query(
      `CALL ${MARKET_STORE_PROCEDURE.FIND_ALL_ADVANCED}(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        skip,
        limit,
        includeInactive,
        search,
        baseSymbol,
        quoteSymbol,
        quoteSymbolsCsv,
        sortByParam,
        sortOrder,
        fuzzySearch,
      ],
    );

    await this.dataSource.query(
      `CALL ${MARKET_STORE_PROCEDURE.COUNT_ADVANCED}(?, ?, ?, ?, ?, ?, @total)`,
      [includeInactive, search, baseSymbol, quoteSymbol, quoteSymbolsCsv, fuzzySearch],
    );
    const totalResult = await this.dataSource.query('SELECT @total as total');
    const total = Number(totalResult[0]?.total ?? 0);
    const rows = result?.[0] || [];
    const data = rows.map((row: any) => this.mapProcedureResultToEntity(row));

    return { data, total, page, limit };
  }

  /**
   * Find all active market pairs using stored procedure
   * Database Procedure Pattern: sp_market_find_active
   */
  async findActive(): Promise<MarketPair[]> {
    const result = await this.dataSource.query(`CALL ${MARKET_STORE_PROCEDURE.FIND_ACTIVE}()`);
    if (!result || result.length === 0 || !result[0]) {
      return [];
    }
    return result[0].map((row: any) => this.mapProcedureResultToEntity(row));
  }

  /**
   * Check if market pair exists by base and quote currencies using stored procedure
   * Database Procedure Pattern: sp_market_pair_exists
   */
  async pairExists(
    baseCurrencyId: string,
    quoteCurrencyId: string,
    excludePairId?: string,
  ): Promise<boolean> {
    const _result = await this.dataSource.query(
      `CALL ${MARKET_STORE_PROCEDURE.PAIR_EXISTS}(?, ?, ?, @exists)`,
      [baseCurrencyId, quoteCurrencyId, excludePairId || null],
    );
    const existsResult = await this.dataSource.query('SELECT @exists as exists');
    return existsResult[0]?.exists === 1 || existsResult[0]?.exists === true;
  }

  /**
   * Check if symbol exists using stored procedure
   * Database Procedure Pattern: sp_market_symbol_exists
   */
  async symbolExists(symbol: string, excludePairId?: string): Promise<boolean> {
    const _result = await this.dataSource.query(
      `CALL ${MARKET_STORE_PROCEDURE.SYMBOL_EXISTS}(?, ?, @exists)`,
      [symbol.toUpperCase(), excludePairId || null],
    );
    const existsResult = await this.dataSource.query('SELECT @exists as exists');
    return existsResult[0]?.exists === 1 || existsResult[0]?.exists === true;
  }

  /**
   * Map stored procedure result to MarketPair entity
   * Helper method to convert procedure result format to entity format
   */
  private mapProcedureResultToEntity(row: any): MarketPair {
    const pair = new MarketPair();
    pair.pair_id = String(row.pair_id ?? '');
    pair.base_currency_id = String(row.base_currency_id ?? '');
    pair.quote_currency_id = String(row.quote_currency_id ?? '');
    pair.symbol = row.symbol || '';
    pair.price_scale = row.price_scale ?? 2;
    pair.amount_scale = row.amount_scale ?? 6;
    pair.min_order_amount = row.min_order_amount?.toString() || '0.0001';
    pair.maker_fee_rate = row.maker_fee_rate?.toString() || '0.001';
    pair.taker_fee_rate = row.taker_fee_rate?.toString() || '0.001';
    pair.is_active = row.is_active === 1 || row.is_active === true;
    pair.created_at = row.created_at;

    // Map currency relations if available
    if (row.base_currency_symbol || row.quote_currency_symbol) {
      pair.base_currency = {
        currency_id: String(row.base_currency_id ?? ''),
        symbol: row.base_currency_symbol || '',
        name: row.base_currency_name || '',
      } as any;
      pair.quote_currency = {
        currency_id: String(row.quote_currency_id ?? ''),
        symbol: row.quote_currency_symbol || '',
        name: row.quote_currency_name || '',
      } as any;
    }

    return pair;
  }

  private mapTradeRow(row: any): Trade {
    const trade = new Trade();
    trade.trade_id = String(row.trade_id ?? '');
    trade.pair_id = String(row.pair_id ?? '');
    trade.taker_order_id = String(row.taker_order_id ?? '');
    trade.maker_order_id = String(row.maker_order_id ?? '');
    trade.price = row.price?.toString() || '0';
    trade.amount = row.amount?.toString() || '0';
    trade.taker_fee = row.taker_fee?.toString() || '0';
    trade.maker_fee = row.maker_fee?.toString() || '0';
    trade.fee_currency_id = String(row.fee_currency_id ?? '');
    trade.created_at = row.created_at;
    return trade;
  }

  /**
   * Get order book for a market pair
   * Complex Query: Aggregates orders by price level
   */
  async getOrderBook(pairId: string, limit: number = 20): Promise<{ bids: any[]; asks: any[] }> {
    const bidsResult = await this.dataSource.query(
      `CALL ${MARKET_STORE_PROCEDURE.ORDER_BOOK_BIDS}(?, ?)`,
      [pairId, limit],
    );
    const asksResult = await this.dataSource.query(
      `CALL ${MARKET_STORE_PROCEDURE.ORDER_BOOK_ASKS}(?, ?)`,
      [pairId, limit],
    );

    const bids = bidsResult?.[0] || [];
    const asks = asksResult?.[0] || [];

    const toLevel = (row: any) => ({
      price: row.price?.toString() ?? '0',
      amount: row.amount?.toString() ?? '0',
      orders: parseInt(row.orders?.toString() ?? '0', 10) || 0,
    });
    const validPrice = (row: any) => {
      const p = row?.price;
      if (p == null) return false;
      const n = Number(p);
      return Number.isFinite(n) && n > 0;
    };

    return {
      bids: bids.filter(validPrice).map(toLevel),
      asks: asks.filter(validPrice).map(toLevel),
    };
  }

  /**
   * Get market ticker (24h statistics) from trades (stored procedure).
   * Returns zeroed string fields when no data; service layer may apply OHLCV fallback.
   */
  async getTicker(pairId: string): Promise<IMarketTickerData> {
    const result = await this.dataSource.query(`CALL ${MARKET_STORE_PROCEDURE.TICKER}(?)`, [
      pairId,
    ]);
    const row = result?.[0]?.[0] || {};

    const lastPrice = row.last_price?.toString() || '0';
    const open24h = row.open_24h?.toString() || lastPrice;
    const high24h = row.high_24h?.toString() || lastPrice;
    const low24h = row.low_24h?.toString() || lastPrice;
    const volume24h = row.volume_24h?.toString() || '0';
    const quoteVolume24h = row.quote_volume_24h?.toString() || '0';
    const bestBid = row.best_bid?.toString() || '0';
    const bestAsk = row.best_ask?.toString() || '0';

    const changeAmount = parseFloat(lastPrice) - parseFloat(open24h);
    const changePercent =
      parseFloat(open24h) > 0 ? ((changeAmount / parseFloat(open24h)) * 100).toFixed(2) : '0';

    return {
      lastPrice,
      high24h,
      low24h,
      open24h,
      volume24h,
      quoteVolume24h,
      change24h: changePercent,
      changeAmount24h: changeAmount.toFixed(18),
      bestBid,
      bestAsk,
    };
  }

  /**
   * Get recent trades for a market pair
   */
  async getRecentTrades(pairId: string, limit: number = 50): Promise<Trade[]> {
    const result = await this.dataSource.query(
      `CALL ${MARKET_STORE_PROCEDURE.RECENT_TRADES}(?, ?)`,
      [pairId, limit],
    );
    const rows = result?.[0] || [];
    return rows.map((row: any) => this.mapTradeRow(row));
  }

  /**
   * Override create to use stored procedure
   * Database Procedure Pattern: sp_market_create (UUID v7: pair_id passed IN)
   */
  async create(entity: Partial<MarketPair>): Promise<MarketPair> {
    const pairId = entity.pair_id ?? newUuid();
    const symbol = entity.symbol ? entity.symbol.toUpperCase() : null;

    await this.dataSource.query(
      `CALL ${MARKET_STORE_PROCEDURE.CREATE}(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        pairId,
        entity.base_currency_id,
        entity.quote_currency_id,
        symbol,
        entity.price_scale ?? 2,
        entity.amount_scale ?? 6,
        entity.min_order_amount ?? '0.0001',
        entity.maker_fee_rate ?? 0.001,
        entity.taker_fee_rate ?? 0.001,
        entity.is_active ?? true,
      ],
    );

    const createdPair = await this.findById(pairId);
    if (!createdPair) {
      throw new Error('Failed to fetch created market pair');
    }
    return createdPair;
  }

  /**
   * Override update to use stored procedure
   * Database Procedure Pattern: sp_market_update
   */
  async update(id: number | string, entity: Partial<MarketPair>): Promise<MarketPair> {
    // Normalize symbol to uppercase if provided
    const symbol = entity.symbol ? entity.symbol.toUpperCase() : null;

    // Call stored procedure
    await this.dataSource.query(
      `CALL ${MARKET_STORE_PROCEDURE.UPDATE}(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        entity.base_currency_id ?? null,
        entity.quote_currency_id ?? null,
        symbol,
        entity.price_scale ?? null,
        entity.amount_scale ?? null,
        entity.min_order_amount ?? null,
        entity.maker_fee_rate ?? null,
        entity.taker_fee_rate ?? null,
        entity.is_active ?? null,
      ],
    );

    // Fetch the updated pair using stored procedure
    const updatedPair = await this.findById(id);
    if (!updatedPair) {
      throw new Error(`Market pair with id ${id} not found after update`);
    }
    return updatedPair;
  }

  /**
   * Override delete to use stored procedure
   * Database Procedure Pattern: sp_market_delete
   */
  async delete(id: number | string): Promise<void> {
    await this.dataSource.query(`CALL ${MARKET_STORE_PROCEDURE.DELETE}(?)`, [id]);
  }
}
