import { Injectable } from '@nestjs/common';
import { DataSource, FindManyOptions } from 'typeorm';
import { BaseRepository } from '@/common/repositories';
import { MarketPair } from '@/entities/market-pair.entity';
import { Order } from '@/entities/order.entity';
import { Trade } from '@/entities/trade.entity';

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
   */
  async findByCurrencies(
    baseCurrencyId: number,
    quoteCurrencyId: number,
  ): Promise<MarketPair | null> {
    try {
      return await this.findOne({
        where: {
          base_currency_id: baseCurrencyId,
          quote_currency_id: quoteCurrencyId,
        } as any,
        relations: ['base_currency', 'quote_currency'],
      });
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
    pair.pair_id = row.pair_id;
    pair.base_currency_id = row.base_currency_id;
    pair.quote_currency_id = row.quote_currency_id;
    pair.symbol = row.symbol;
    pair.price_scale = row.price_scale;
    pair.amount_scale = row.amount_scale;
    pair.min_order_amount = row.min_order_amount?.toString() || '0.0001';
    pair.maker_fee_rate = row.maker_fee_rate?.toString() || '0.001';
    pair.taker_fee_rate = row.taker_fee_rate?.toString() || '0.001';
    pair.is_active = row.is_active === 1 || row.is_active === true;
    pair.created_at = row.created_at;

    // Map currency relations if available
    if (row.base_currency_symbol || row.quote_currency_symbol) {
      pair.base_currency = {
        currency_id: row.base_currency_id,
        symbol: row.base_currency_symbol,
        name: row.base_currency_name,
      } as any;
      pair.quote_currency = {
        currency_id: row.quote_currency_id,
        symbol: row.quote_currency_symbol,
        name: row.quote_currency_name,
      } as any;
    }

    return pair;
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
      const orderRepository = this.dataSource.getRepository(Order);

      // Get bids (BUY orders) - sorted by price DESC
      const bids = await orderRepository
        .createQueryBuilder('order')
        .select('order.price', 'price')
        .addSelect('SUM(order.amount - order.filled_amount)', 'amount')
        .addSelect('COUNT(*)', 'orders')
        .where('order.pair_id = :pairId', { pairId })
        .andWhere('order.side = :side', { side: 'BUY' })
        .andWhere('order.status IN (:...statuses)', {
          statuses: ['OPEN', 'PARTIAL'],
        })
        .andWhere('order.price IS NOT NULL')
        .groupBy('order.price')
        .orderBy('order.price', 'DESC')
        .limit(limit)
        .getRawMany();

      // Get asks (SELL orders) - sorted by price ASC
      const asks = await orderRepository
        .createQueryBuilder('order')
        .select('order.price', 'price')
        .addSelect('SUM(order.amount - order.filled_amount)', 'amount')
        .addSelect('COUNT(*)', 'orders')
        .where('order.pair_id = :pairId', { pairId })
        .andWhere('order.side = :side', { side: 'SELL' })
        .andWhere('order.status IN (:...statuses)', {
          statuses: ['OPEN', 'PARTIAL'],
        })
        .andWhere('order.price IS NOT NULL')
        .groupBy('order.price')
        .orderBy('order.price', 'ASC')
        .limit(limit)
        .getRawMany();

      return {
        bids: bids.map((bid) => ({
          price: bid.price?.toString() || '0',
          amount: bid.amount?.toString() || '0',
          orders: parseInt(bid.orders?.toString() || '0') || 0,
        })),
        asks: asks.map((ask) => ({
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
   * Get market ticker (24h statistics)
   * Complex Query: Aggregates trades for ticker data
   */
  async getTicker(pairId: number): Promise<any> {
    try {
      const tradeRepository = this.dataSource.getRepository(Trade);
      const orderRepository = this.dataSource.getRepository(Order);

      // Get 24h ago timestamp
      const twentyFourHoursAgo = new Date();
      twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

      // Get last trade
      const lastTrade = await tradeRepository
        .createQueryBuilder('trade')
        .where('trade.pair_id = :pairId', { pairId })
        .orderBy('trade.created_at', 'DESC')
        .limit(1)
        .getOne();

      // Get 24h statistics from trades
      const stats24h = await tradeRepository
        .createQueryBuilder('trade')
        .select('MAX(trade.price)', 'high')
        .addSelect('MIN(trade.price)', 'low')
        .addSelect('SUM(trade.amount)', 'volume')
        .addSelect('SUM(trade.price * trade.amount)', 'quoteVolume')
        .where('trade.pair_id = :pairId', { pairId })
        .andWhere('trade.created_at >= :since', { since: twentyFourHoursAgo })
        .getRawOne();

      // Get opening price (first trade in 24h)
      const openingTrade = await tradeRepository
        .createQueryBuilder('trade')
        .where('trade.pair_id = :pairId', { pairId })
        .andWhere('trade.created_at >= :since', { since: twentyFourHoursAgo })
        .orderBy('trade.created_at', 'ASC')
        .limit(1)
        .getOne();

      // Get best bid and ask from order book
      const bestBid = await orderRepository
        .createQueryBuilder('order')
        .where('order.pair_id = :pairId', { pairId })
        .andWhere('order.side = :side', { side: 'BUY' })
        .andWhere('order.status IN (:...statuses)', {
          statuses: ['OPEN', 'PARTIAL'],
        })
        .andWhere('order.price IS NOT NULL')
        .orderBy('order.price', 'DESC')
        .limit(1)
        .getOne();

      const bestAsk = await orderRepository
        .createQueryBuilder('order')
        .where('order.pair_id = :pairId', { pairId })
        .andWhere('order.side = :side', { side: 'SELL' })
        .andWhere('order.status IN (:...statuses)', {
          statuses: ['OPEN', 'PARTIAL'],
        })
        .andWhere('order.price IS NOT NULL')
        .orderBy('order.price', 'ASC')
        .limit(1)
        .getOne();

      const lastPrice = lastTrade ? lastTrade.price?.toString() || '0' : '0';
      const open24h = openingTrade ? openingTrade.price?.toString() || lastPrice : lastPrice;
      const high24h = stats24h?.high?.toString() || lastPrice;
      const low24h = stats24h?.low?.toString() || lastPrice;
      const volume24h = stats24h?.volume?.toString() || '0';
      const quoteVolume24h = stats24h?.quoteVolume?.toString() || '0';

      // Calculate change
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
        bestBid: bestBid?.price?.toString() || '0',
        bestAsk: bestAsk?.price?.toString() || '0',
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
      const tradeRepository = this.dataSource.getRepository(Trade);
      return await tradeRepository.find({
        where: { pair_id: pairId } as any,
        order: { created_at: 'DESC' },
        take: limit,
        relations: ['taker_order', 'maker_order'],
      });
    } catch (error) {
      this.logger.error(`Error getting recent trades for pair: ${pairId}`, error);
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
