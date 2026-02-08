import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { BaseRepository } from '@/common/repositories';
import { MarketPair } from '@/entities/market-pair.entity';
import { Trade } from '@/entities/trade.entity';
import { IMarketTickerData } from '../interfaces/market-ticker.interface';

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
    try {
      // If options has a where clause with pair_id, use it
      if (options?.where?.pair_id !== undefined) {
        const id = options.where.pair_id;
        const result = await this.dataSource.query('CALL sp_market_find_by_id(?)', [id]);
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
    } catch (error) {
      this.logger.error(`Error finding one market pair`, error);
      throw error;
    }
  }

  /**
   * Override findById to use stored procedure
   * Database Procedure Pattern: sp_market_find_by_id
   */
  async findById(id: number | string): Promise<MarketPair | null> {
    try {
      const result = await this.dataSource.query('CALL sp_market_find_by_id(?)', [id]);
      if (!result || result.length === 0 || !result[0] || result[0].length === 0) {
        return null;
      }
      return this.mapProcedureResultToEntity(result[0][0]);
    } catch (error) {
      this.logger.error(`Error finding market pair by ID: ${id}`, error);
      throw error;
    }
  }

  /**
   * Find market pair by symbol using stored procedure
   * Database Procedure Pattern: sp_market_find_by_symbol
   */
  async findBySymbol(symbol: string): Promise<MarketPair | null> {
    try {
      const result = await this.dataSource.query('CALL sp_market_find_by_symbol(?)', [
        symbol.toUpperCase(),
      ]);
      if (!result || result.length === 0 || !result[0] || result[0].length === 0) {
        return null;
      }
      return this.mapProcedureResultToEntity(result[0][0]);
    } catch (error) {
      this.logger.error(`Error finding market pair by symbol: ${symbol}`, error);
      throw error;
    }
  }

  /**
   * Find market pair by base and quote currency IDs
   * Database Procedure Pattern: sp_market_find_by_currencies
   */
  async findByCurrencies(
    baseCurrencyId: number,
    quoteCurrencyId: number,
  ): Promise<MarketPair | null> {
    try {
      const result = await this.dataSource.query(
        'CALL sp_market_find_by_currencies(?, ?)',
        [baseCurrencyId, quoteCurrencyId],
      );
      if (!result || result.length === 0 || !result[0] || result[0].length === 0) {
        return null;
      }
      return this.mapProcedureResultToEntity(result[0][0]);
    } catch (error) {
      this.logger.error(
        `Error finding market pair by currencies: ${baseCurrencyId}/${quoteCurrencyId}`,
        error,
      );
      throw error;
    }
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
    try {
      const skip = (page - 1) * limit;
      const result = await this.dataSource.query('CALL sp_market_find_all(?, ?, ?)', [
        skip,
        limit,
        includeInactive,
      ]);

      // Get total count using stored procedure
      await this.dataSource.query('CALL sp_market_count(?, @total)', [includeInactive]);
      const totalResult = await this.dataSource.query('SELECT @total as total');
      const total = totalResult[0]?.total || 0;

      const data = result[0]?.map((row: any) => this.mapProcedureResultToEntity(row)) || [];

      return {
        data,
        total,
        page,
        limit,
      };
    } catch (error) {
      this.logger.error('Error finding all market pairs', error);
      throw error;
    }
  }

  /**
   * Override findWithPagination to use stored procedures
   */
  async findWithPagination(
    page: number = 1,
    limit: number = 10,
    options?: any,
  ): Promise<{ data: MarketPair[]; total: number; page: number; limit: number }> {
    return this.findAll(page, limit, options?.includeInactive ?? false);
  }

  /**
   * Find all active market pairs using stored procedure
   * Database Procedure Pattern: sp_market_find_active
   */
  async findActive(): Promise<MarketPair[]> {
    try {
      const result = await this.dataSource.query('CALL sp_market_find_active()');
      if (!result || result.length === 0 || !result[0]) {
        return [];
      }
      return result[0].map((row: any) => this.mapProcedureResultToEntity(row));
    } catch (error) {
      this.logger.error('Error finding active market pairs', error);
      throw error;
    }
  }

  /**
   * Check if market pair exists by base and quote currencies using stored procedure
   * Database Procedure Pattern: sp_market_pair_exists
   */
  async pairExists(
    baseCurrencyId: number,
    quoteCurrencyId: number,
    excludePairId?: number,
  ): Promise<boolean> {
    try {
      const result = await this.dataSource.query('CALL sp_market_pair_exists(?, ?, ?, @exists)', [
        baseCurrencyId,
        quoteCurrencyId,
        excludePairId || null,
      ]);
      const existsResult = await this.dataSource.query('SELECT @exists as exists');
      return existsResult[0]?.exists === 1 || existsResult[0]?.exists === true;
    } catch (error) {
      this.logger.error('Error checking pair existence', error);
      throw error;
    }
  }

  /**
   * Check if symbol exists using stored procedure
   * Database Procedure Pattern: sp_market_symbol_exists
   */
  async symbolExists(symbol: string, excludePairId?: number): Promise<boolean> {
    try {
      const result = await this.dataSource.query('CALL sp_market_symbol_exists(?, ?, @exists)', [
        symbol.toUpperCase(),
        excludePairId || null,
      ]);
      const existsResult = await this.dataSource.query('SELECT @exists as exists');
      return existsResult[0]?.exists === 1 || existsResult[0]?.exists === true;
    } catch (error) {
      this.logger.error(`Error checking symbol existence: ${symbol}`, error);
      throw error;
    }
  }

  /**
   * Map stored procedure result to MarketPair entity
   * Helper method to convert procedure result format to entity format
   */
  private mapProcedureResultToEntity(row: any): MarketPair {
    const pair = new MarketPair();
    pair.pair_id = row.pair_id || 0;
    pair.base_currency_id = row.base_currency_id || 0;
    pair.quote_currency_id = row.quote_currency_id || 0;
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
        currency_id: row.base_currency_id || 0,
        symbol: row.base_currency_symbol || '',
        name: row.base_currency_name || '',
      } as any;
      pair.quote_currency = {
        currency_id: row.quote_currency_id || 0,
        symbol: row.quote_currency_symbol || '',
        name: row.quote_currency_name || '',
      } as any;
    }

    return pair;
  }

  private mapTradeRow(row: any): Trade {
    const trade = new Trade();
    trade.trade_id = row.trade_id;
    trade.pair_id = row.pair_id;
    trade.taker_order_id = row.taker_order_id;
    trade.maker_order_id = row.maker_order_id;
    trade.price = row.price?.toString() || '0';
    trade.amount = row.amount?.toString() || '0';
    trade.taker_fee = row.taker_fee?.toString() || '0';
    trade.maker_fee = row.maker_fee?.toString() || '0';
    trade.fee_currency_id = row.fee_currency_id;
    trade.created_at = row.created_at;
    return trade;
  }

  /**
   * Get order book for a market pair
   * Complex Query: Aggregates orders by price level
   */
  async getOrderBook(
    pairId: number,
    limit: number = 20,
  ): Promise<{ bids: any[]; asks: any[] }> {
    try {
      const bidsResult = await this.dataSource.query(
        'CALL sp_market_order_book_bids(?, ?)',
        [pairId, limit],
      );
      const asksResult = await this.dataSource.query(
        'CALL sp_market_order_book_asks(?, ?)',
        [pairId, limit],
      );

      const bids = bidsResult?.[0] || [];
      const asks = asksResult?.[0] || [];

      return {
        bids: bids.map((bid: any) => ({
          price: bid.price?.toString() || '0',
          amount: bid.amount?.toString() || '0',
          orders: parseInt(bid.orders?.toString() || '0') || 0,
        })),
        asks: asks.map((ask: any) => ({
          price: ask.price?.toString() || '0',
          amount: ask.amount?.toString() || '0',
          orders: parseInt(ask.orders?.toString() || '0') || 0,
        })),
      };
    } catch (error) {
      this.logger.error(`Error getting order book for pair: ${pairId}`, error);
      throw error;
    }
  }

  /**
   * Get latest close price from OHLCV (for ticker fallback when no trades).
   * Returns '0' when no rows (repository contract: no throw).
   */
  async getLatestCloseFromOHLCV(pairId: number): Promise<string> {
    try {
      const rows = await this.dataSource.query(
        `SELECT \`close\` FROM ohlcv WHERE pair_id = ? ORDER BY open_time DESC LIMIT 1`,
        [pairId],
      );
      const row = Array.isArray(rows) ? rows[0] : null;
      const close = row?.close;
      return close != null ? String(close) : '0';
    } catch {
      return '0';
    }
  }

  /**
   * Get close price from OHLCV at ~24h ago (for ticker change24h when no trades).
   * Returns '0' when no candle that old (caller may use getEarliestCloseFromOHLCV as fallback).
   */
  async getOHLCVClose24hAgo(pairId: number): Promise<string> {
    try {
      const rows = await this.dataSource.query(
        `SELECT \`close\` FROM ohlcv
         WHERE pair_id = ? AND open_time <= DATE_SUB(NOW(), INTERVAL 23 HOUR)
         ORDER BY open_time DESC LIMIT 1`,
        [pairId],
      );
      const row = Array.isArray(rows) ? rows[0] : null;
      const close = row?.close;
      return close != null ? String(close) : '0';
    } catch {
      return '0';
    }
  }

  /**
   * Get close of the earliest OHLCV candle for pair (fallback for change24h when no candle at 24h ago).
   * Markets with under 24h of data can still show volatility from first known price to current.
   * Returns '0' when no rows (repository contract: no throw).
   */
  async getEarliestCloseFromOHLCV(pairId: number): Promise<string> {
    try {
      const rows = await this.dataSource.query(
        `SELECT \`close\` FROM ohlcv WHERE pair_id = ? ORDER BY open_time ASC LIMIT 1`,
        [pairId],
      );
      const row = Array.isArray(rows) ? rows[0] : null;
      const close = row?.close;
      return close != null ? String(close) : '0';
    } catch {
      return '0';
    }
  }

  /**
   * Sum volume from OHLCV in last 24h (for ticker volume24h when no trades).
   * Returns '0' when no rows (repository contract: no throw).
   */
  async getOHLCVVolume24h(pairId: number): Promise<string> {
    try {
      const rows = await this.dataSource.query(
        `SELECT COALESCE(SUM(volume), 0) as total FROM ohlcv
         WHERE pair_id = ? AND open_time >= DATE_SUB(NOW(), INTERVAL 24 HOUR)`,
        [pairId],
      );
      const row = Array.isArray(rows) ? rows[0] : null;
      const total = row?.total;
      return total != null ? String(total) : '0';
    } catch {
      return '0';
    }
  }

  /**
   * Get market ticker (24h statistics) from trades (stored procedure).
   * Returns zeroed string fields when no data; service layer may apply OHLCV fallback.
   */
  async getTicker(pairId: number): Promise<IMarketTickerData> {
    try {
      const result = await this.dataSource.query('CALL sp_market_ticker(?)', [pairId]);
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
        parseFloat(open24h) > 0
          ? ((changeAmount / parseFloat(open24h)) * 100).toFixed(2)
          : '0';

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
    } catch (error) {
      this.logger.error(`Error getting ticker for pair: ${pairId}`, error);
      throw error;
    }
  }

  /**
   * Get recent trades for a market pair
   */
  async getRecentTrades(pairId: number, limit: number = 50): Promise<Trade[]> {
    try {
      const result = await this.dataSource.query('CALL sp_market_recent_trades(?, ?)', [
        pairId,
        limit,
      ]);
      const rows = result?.[0] || [];
      return rows.map((row: any) => this.mapTradeRow(row));
    } catch (error) {
      this.logger.error(`Error getting recent trades for pair: ${pairId}`, error);
      throw error;
    }
  }

  /**
   * Get OHLCV data for a market pair
   * Database Procedure Pattern: sp_ohlcv_get_by_pair_interval
   * Used for TradingView chart historical data (Repository Pattern)
   */
  async getOHLCV(
    pairId: number,
    intervalSec: number,
    limit: number = 100,
  ): Promise<
    {
      pair_id: number;
      interval_sec: number;
      open_time: Date;
      open: string;
      high: string;
      low: string;
      close: string;
      volume: string;
    }[]
  > {
    try {
      const result = await this.dataSource.query(
        'CALL sp_ohlcv_get_by_pair_interval(?, ?, ?)',
        [pairId, intervalSec, limit],
      );

      const rows = result?.[0] ?? [];
      return rows
        .map((row: any) => ({
          pair_id: row.pair_id,
          interval_sec: row.interval_sec,
          open_time: row.open_time,
          open: row.open?.toString() || '0',
          high: row.high?.toString() || '0',
          low: row.low?.toString() || '0',
          close: row.close?.toString() || '0',
          volume: row.volume?.toString() || '0',
        }))
        .reverse();
    } catch (error) {
      this.logger.error(`Error getting OHLCV for pair: ${pairId}`, error);
      throw error;
    }
  }

  /**
   * Get OHLCV data for a market pair within a time range (for chart range filter).
   */
  async getOHLCVByRange(
    pairId: number,
    intervalSec: number,
    fromDate: Date,
    limit: number = 500,
  ): Promise<
    {
      pair_id: number;
      interval_sec: number;
      open_time: Date;
      open: string;
      high: string;
      low: string;
      close: string;
      volume: string;
    }[]
  > {
    try {
      const rows = await this.dataSource.query(
        `SELECT pair_id, interval_sec, open_time, \`open\`, high, low, \`close\`, volume
         FROM ohlcv
         WHERE pair_id = ? AND interval_sec = ? AND open_time >= ?
         ORDER BY open_time DESC
         LIMIT ?`,
        [pairId, intervalSec, fromDate, limit],
      );
      const list = Array.isArray(rows) ? rows : [];
      return list
        .map((row: any) => ({
          pair_id: row.pair_id,
          interval_sec: row.interval_sec,
          open_time: row.open_time,
          open: row.open?.toString() || '0',
          high: row.high?.toString() || '0',
          low: row.low?.toString() || '0',
          close: row.close?.toString() || '0',
          volume: row.volume?.toString() || '0',
        }))
        .reverse();
    } catch (error) {
      this.logger.error(`Error getting OHLCV by range for pair: ${pairId}`, error);
      throw error;
    }
  }

  /**
   * Upsert one OHLCV candle (insert or update on duplicate key).
   * Used to persist realtime candle stream to DB so GET /markets/:id/ohlcv returns data.
   * Database Procedure Pattern: sp_ohlcv_upsert
   */
  async upsertOHLCV(
    pairId: number,
    intervalSec: number,
    openTime: Date,
    open: string,
    high: string,
    low: string,
    close: string,
    volume: string,
  ): Promise<void> {
    try {
      await this.dataSource.query(
        'CALL sp_ohlcv_upsert(?, ?, ?, ?, ?, ?, ?, ?)',
        [pairId, intervalSec, openTime, open, high, low, close, volume],
      );
    } catch (error) {
      this.logger.error(
        `Error upserting OHLCV for pair ${pairId} interval_sec ${intervalSec} open_time ${openTime.toISOString()}`,
        error,
      );
      throw error;
    }
  }

  /**
   * Batch upsert OHLCV candles in one query to reduce DB round-trips.
   * Use when persisting many closed candles (e.g. after buffer flush).
   */
  async upsertOHLCVBatch(
    rows: Array<{
      pairId: number;
      intervalSec: number;
      openTime: Date;
      open: string;
      high: string;
      low: string;
      close: string;
      volume: string;
    }>,
  ): Promise<void> {
    if (rows.length === 0) return;
    try {
      const placeholders = rows
        .map(() => '(?, ?, ?, ?, ?, ?, ?, ?)')
        .join(', ');
      const sql = `INSERT INTO ohlcv (pair_id, interval_sec, open_time, \`open\`, high, low, \`close\`, volume)
VALUES ${placeholders}
ON DUPLICATE KEY UPDATE
  high = VALUES(high),
  low = VALUES(low),
  \`close\` = VALUES(\`close\`),
  volume = VALUES(volume)`;
      const params = rows.flatMap((r) => [
        r.pairId,
        r.intervalSec,
        r.openTime,
        r.open,
        r.high,
        r.low,
        r.close,
        r.volume,
      ]);
      await this.dataSource.query(sql, params);
    } catch (error) {
      this.logger.error(
        `Error batch upserting OHLCV (${rows.length} rows): ${(error as Error)?.message ?? error}`,
        error,
      );
      throw error;
    }
  }

  /**
   * Override create to use stored procedure
   * Database Procedure Pattern: sp_market_create
   */
  async create(entity: Partial<MarketPair>): Promise<MarketPair> {
    try {
      // Normalize symbol to uppercase
      const symbol = entity.symbol ? entity.symbol.toUpperCase() : null;

      // Call stored procedure
      const result = await this.dataSource.query(
        'CALL sp_market_create(?, ?, ?, ?, ?, ?, ?, ?, ?, @pair_id)',
        [
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

      // Get the created pair ID
      const idResult = await this.dataSource.query('SELECT @pair_id as pair_id');
      const pairId = idResult[0]?.pair_id;

      if (!pairId) {
        throw new Error('Failed to create market pair');
      }

      // Fetch the created pair using stored procedure
      const createdPair = await this.findById(pairId);
      if (!createdPair) {
        throw new Error('Failed to fetch created market pair');
      }
      return createdPair;
    } catch (error) {
      this.logger.error('Error creating market pair', error);
      throw error;
    }
  }

  /**
   * Override update to use stored procedure
   * Database Procedure Pattern: sp_market_update
   */
  async update(id: number | string, entity: Partial<MarketPair>): Promise<MarketPair> {
    try {
      // Normalize symbol to uppercase if provided
      const symbol = entity.symbol ? entity.symbol.toUpperCase() : null;

      // Call stored procedure
      await this.dataSource.query('CALL sp_market_update(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
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
      ]);

      // Fetch the updated pair using stored procedure
      const updatedPair = await this.findById(id);
      if (!updatedPair) {
        throw new Error(`Market pair with id ${id} not found after update`);
      }
      return updatedPair;
    } catch (error) {
      this.logger.error(`Error updating market pair: ${id}`, error);
      throw error;
    }
  }

  /**
   * Override delete to use stored procedure
   * Database Procedure Pattern: sp_market_delete
   */
  async delete(id: number | string): Promise<void> {
    try {
      await this.dataSource.query('CALL sp_market_delete(?)', [id]);
    } catch (error) {
      this.logger.error(`Error deleting market pair: ${id}`, error);
      throw error;
    }
  }
}
