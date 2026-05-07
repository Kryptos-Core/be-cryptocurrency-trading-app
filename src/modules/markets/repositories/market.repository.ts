import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { DataSource } from 'typeorm';
import { BaseRepository } from '@/common/repositories';
import { getEntityManagerFromTransactionContext } from '@/common/typeorm/entity-manager-from-context';
import type { TransactionContext } from '@/common/types/transaction-context';
import { calcSkip } from '@/common/utils/pagination.util';
import { newUuid } from '@/common/utils/uuid.util';
import { MarketPair } from '@/entities/market-pair.entity';
import { Trade } from '@/entities/trade.entity';
import type {
  MarketRepositoryFilterOptions,
  MarketRepositoryOrderBookLevel,
} from '../domain/ports';
import type { IMarketTickerData } from '../interfaces/market-ticker.interface';

type SqlExecutor = Pick<DataSource | EntityManager, 'query'>;
type MarketSortBy = 'symbol' | 'base' | 'quote' | 'createdAt';
type OrderBookLevel = MarketRepositoryOrderBookLevel;
type MarketPaginationOptions = MarketRepositoryFilterOptions;

type MarketPairRow = {
  pair_id: string;
  base_currency_id: string;
  quote_currency_id: string;
  symbol: string;
  price_scale: number;
  amount_scale: number;
  min_order_amount: string;
  maker_fee_rate: string;
  taker_fee_rate: string;
  is_active: boolean | number;
  created_at: Date;
  updated_at?: Date;
  base_currency_symbol?: string;
  base_currency_name?: string;
  quote_currency_symbol?: string;
  quote_currency_name?: string;
};

type TradeRow = {
  trade_id: string;
  pair_id: string;
  taker_order_id: string;
  maker_order_id: string;
  price: string;
  amount: string;
  taker_fee: string;
  maker_fee: string;
  fee_currency_id: string;
  created_at: Date;
  taker_side?: 'BUY' | 'SELL';
};

@Injectable()
export class MarketRepository extends BaseRepository<MarketPair> {
  constructor(dataSource: DataSource) {
    super(MarketPair, dataSource);
  }

  async findOne(options: {
    where: { pair_id?: string; symbol?: string };
    relations?: string[];
  }): Promise<MarketPair | null> {
    if (options?.where?.pair_id !== undefined) {
      return this.findById(options.where.pair_id);
    }
    if (options?.where?.symbol !== undefined) {
      return this.findBySymbol(options.where.symbol);
    }
    return null;
  }

  async findById(id: number | string): Promise<MarketPair | null> {
    return this.findByIdUsingExecutor(this.dataSource, id);
  }

  private async findByIdUsingExecutor(
    executor: SqlExecutor,
    id: number | string,
  ): Promise<MarketPair | null> {
    const rows = await executor.query(this.baseSelectSql('WHERE mp.pair_id = $1'), [id]);
    return rows?.[0] ? this.mapRowToEntity(rows[0] as MarketPairRow) : null;
  }

  async findBySymbol(symbol: string): Promise<MarketPair | null> {
    const rows = await this.dataSource.query(this.baseSelectSql('WHERE UPPER(mp.symbol) = $1'), [
      symbol.toUpperCase(),
    ]);
    return rows?.[0] ? this.mapRowToEntity(rows[0] as MarketPairRow) : null;
  }

  async findByCurrencies(
    baseCurrencyId: number,
    quoteCurrencyId: number,
  ): Promise<MarketPair | null> {
    const rows = await this.dataSource.query(
      this.baseSelectSql('WHERE mp.base_currency_id = $1 AND mp.quote_currency_id = $2'),
      [String(baseCurrencyId), String(quoteCurrencyId)],
    );
    return rows?.[0] ? this.mapRowToEntity(rows[0] as MarketPairRow) : null;
  }

  async findAll(
    page: number = 1,
    limit: number = 10,
    includeInactive: boolean = false,
  ): Promise<{ data: MarketPair[]; total: number; page: number; limit: number }> {
    return this.findWithPagination(page, limit, { includeInactive });
  }

  async findWithPagination(
    page: number = 1,
    limit: number = 10,
    options?: Record<string, unknown>,
  ): Promise<{ data: MarketPair[]; total: number; page: number; limit: number }> {
    const skip = calcSkip(page, limit);
    const filters = (options ?? {}) as MarketPaginationOptions;
    const includeInactive = filters.includeInactive ?? false;
    const sortBy = filters.sortBy ?? 'symbol';
    const sortOrder = filters.sortOrder === 'desc' ? 'DESC' : 'ASC';

    const params: Array<boolean | string | number | string[]> = [];
    const whereClauses: string[] = [];

    if (!includeInactive) {
      whereClauses.push('mp.is_active = TRUE');
    }

    if (filters.search?.trim()) {
      const term = `%${filters.search.trim()}%`;
      params.push(term);
      const idx = params.length;
      whereClauses.push(
        `(mp.symbol ILIKE $${idx} OR bc.symbol ILIKE $${idx} OR qc.symbol ILIKE $${idx} OR bc.name ILIKE $${idx} OR qc.name ILIKE $${idx})`,
      );
    }

    if (filters.baseSymbol?.trim()) {
      params.push(filters.baseSymbol.trim().toUpperCase());
      whereClauses.push(`UPPER(bc.symbol) = $${params.length}`);
    }

    if (filters.quoteSymbol?.trim()) {
      params.push(filters.quoteSymbol.trim().toUpperCase());
      whereClauses.push(`UPPER(qc.symbol) = $${params.length}`);
    }

    const normalizedQuoteSymbols = (filters.quoteSymbols ?? [])
      .map((item: string) => item.trim().toUpperCase())
      .filter(Boolean);
    if (normalizedQuoteSymbols.length > 0) {
      params.push(normalizedQuoteSymbols);
      whereClauses.push(`UPPER(qc.symbol) = ANY($${params.length})`);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
    const orderSql = this.resolveOrderBy(sortBy, sortOrder);

    const countRows = await this.dataSource.query(
      `SELECT COUNT(*)::int AS total
         FROM market_pairs mp
         INNER JOIN currencies bc ON bc.currency_id = mp.base_currency_id
         INNER JOIN currencies qc ON qc.currency_id = mp.quote_currency_id
         ${whereSql}`,
      params,
    );

    const listParams = [...params, limit, skip];
    const limitIndex = listParams.length - 1;
    const offsetIndex = listParams.length;
    const rows = await this.dataSource.query(
      `${this.baseSelectSql(whereSql)}
       ${orderSql}
       LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
      listParams,
    );

    return {
      data: (rows ?? []).map((row: MarketPairRow) => this.mapRowToEntity(row)),
      total: Number(countRows?.[0]?.total ?? 0),
      page,
      limit,
    };
  }

  async findActive(): Promise<MarketPair[]> {
    const rows = await this.dataSource.query(
      `${this.baseSelectSql('WHERE mp.is_active = TRUE')} ORDER BY mp.symbol ASC`,
    );
    return (rows ?? []).map((row: MarketPairRow) => this.mapRowToEntity(row));
  }

  async pairExists(
    baseCurrencyId: string,
    quoteCurrencyId: string,
    excludePairId?: string,
  ): Promise<boolean> {
    const rows = await this.dataSource.query(
      `SELECT EXISTS(
         SELECT 1
           FROM market_pairs
          WHERE base_currency_id = $1
            AND quote_currency_id = $2
            AND ($3::text IS NULL OR pair_id <> $3)
       ) AS exists`,
      [baseCurrencyId, quoteCurrencyId, excludePairId ?? null],
    );
    return rows?.[0]?.exists === true;
  }

  async symbolExists(symbol: string, excludePairId?: string): Promise<boolean> {
    const rows = await this.dataSource.query(
      `SELECT EXISTS(
         SELECT 1
           FROM market_pairs
          WHERE UPPER(symbol) = $1
            AND ($2::text IS NULL OR pair_id <> $2)
       ) AS exists`,
      [symbol.toUpperCase(), excludePairId ?? null],
    );
    return rows?.[0]?.exists === true;
  }

  async getOrderBook(
    pairId: string,
    limit: number = 20,
  ): Promise<{ bids: OrderBookLevel[]; asks: OrderBookLevel[] }> {
    const baseSql = `
      SELECT
        o.price::text AS price,
        SUM((o.amount::numeric - COALESCE(o.filled_amount::numeric, 0)))::text AS amount,
        COUNT(*)::int AS orders
      FROM orders o
      WHERE o.pair_id = $1
        AND o.side = $2
        AND o.status IN ('OPEN', 'PARTIAL')
        AND o.price IS NOT NULL
        AND (o.amount::numeric - COALESCE(o.filled_amount::numeric, 0)) > 0
      GROUP BY o.price
      ORDER BY o.price %ORDER%
      LIMIT $3`;

    const [bids, asks] = await Promise.all([
      this.dataSource.query(baseSql.replace('%ORDER%', 'DESC'), [pairId, 'BUY', limit]),
      this.dataSource.query(baseSql.replace('%ORDER%', 'ASC'), [pairId, 'SELL', limit]),
    ]);

    return {
      bids: (bids ?? []).map((row: OrderBookLevel) => ({
        price: String(row.price ?? '0'),
        amount: String(row.amount ?? '0'),
        orders: Number(row.orders ?? 0),
      })),
      asks: (asks ?? []).map((row: OrderBookLevel) => ({
        price: String(row.price ?? '0'),
        amount: String(row.amount ?? '0'),
        orders: Number(row.orders ?? 0),
      })),
    };
  }

  async getTicker(pairId: string): Promise<IMarketTickerData> {
    const rows = await this.dataSource.query(
      `WITH recent_trades AS (
          SELECT t.*
            FROM trades t
           WHERE t.pair_id = $1
             AND t.created_at >= NOW() - INTERVAL '24 hours'
        ),
        latest_trade AS (
          SELECT price::text AS last_price
            FROM trades
           WHERE pair_id = $1
           ORDER BY created_at DESC
           LIMIT 1
        ),
        open_trade AS (
          SELECT price::text AS open_24h
            FROM recent_trades
           ORDER BY created_at ASC
           LIMIT 1
        ),
        recent_stats AS (
          SELECT
            COALESCE(MAX(price), 0)::text AS high_24h,
            COALESCE(MIN(price), 0)::text AS low_24h,
            COALESCE(SUM(amount), 0)::text AS volume_24h,
            COALESCE(SUM(price * amount), 0)::text AS quote_volume_24h
          FROM recent_trades
        ),
        book AS (
          SELECT
            (SELECT MAX(price)::text FROM orders WHERE pair_id = $1 AND side = 'BUY' AND status IN ('OPEN', 'PARTIAL') AND price IS NOT NULL) AS best_bid,
            (SELECT MIN(price)::text FROM orders WHERE pair_id = $1 AND side = 'SELL' AND status IN ('OPEN', 'PARTIAL') AND price IS NOT NULL) AS best_ask
        )
        SELECT
          COALESCE((SELECT last_price FROM latest_trade), '0') AS last_price,
          COALESCE((SELECT open_24h FROM open_trade), COALESCE((SELECT last_price FROM latest_trade), '0')) AS open_24h,
          COALESCE((SELECT high_24h FROM recent_stats), '0') AS high_24h,
          COALESCE((SELECT low_24h FROM recent_stats), '0') AS low_24h,
          COALESCE((SELECT volume_24h FROM recent_stats), '0') AS volume_24h,
          COALESCE((SELECT quote_volume_24h FROM recent_stats), '0') AS quote_volume_24h,
          COALESCE((SELECT best_bid FROM book), '0') AS best_bid,
          COALESCE((SELECT best_ask FROM book), '0') AS best_ask`,
      [pairId],
    );

    const row = rows?.[0] ?? {};
    const lastPrice = String(row.last_price ?? '0');
    const open24h = String(row.open_24h ?? lastPrice);
    const changeAmount = Number(lastPrice) - Number(open24h);
    const changePercent =
      Number(open24h) > 0 ? ((changeAmount / Number(open24h)) * 100).toFixed(2) : '0';

    return {
      lastPrice,
      open24h,
      high24h: String(row.high_24h ?? '0'),
      low24h: String(row.low_24h ?? '0'),
      volume24h: String(row.volume_24h ?? '0'),
      quoteVolume24h: String(row.quote_volume_24h ?? '0'),
      change24h: changePercent,
      changeAmount24h: changeAmount.toFixed(18),
      bestBid: String(row.best_bid ?? '0'),
      bestAsk: String(row.best_ask ?? '0'),
    };
  }

  async getRecentTrades(pairId: string, limit: number = 50): Promise<Trade[]> {
    const rows = await this.dataSource.query(
      `SELECT
          t.trade_id,
          t.pair_id,
          t.taker_order_id,
          t.maker_order_id,
          t.price,
          t.amount,
          t.taker_fee,
          t.maker_fee,
          t.fee_currency_id,
          t.created_at,
          o.side AS taker_side
         FROM trades t
         INNER JOIN orders o ON o.order_id = t.taker_order_id
        WHERE t.pair_id = $1
        ORDER BY t.created_at DESC
        LIMIT $2`,
      [pairId, limit],
    );
    return (rows ?? []).map((row: TradeRow) => this.mapTradeRow(row));
  }

  async create(entity: Partial<MarketPair>): Promise<MarketPair> {
    const pairId = entity.pair_id ?? newUuid();
    await this.insertPair(this.dataSource, pairId, entity);
    const createdPair = await this.findById(pairId);
    if (!createdPair) {
      throw new Error('Failed to fetch created market pair');
    }
    return createdPair;
  }

  async createWithinTransaction(
    ctx: TransactionContext,
    entity: Partial<MarketPair>,
  ): Promise<MarketPair> {
    const em = getEntityManagerFromTransactionContext(ctx) as unknown as EntityManager;
    const pairId = entity.pair_id ?? newUuid();
    await this.insertPair(em, pairId, entity);
    const createdPair = await this.findByIdUsingExecutor(em, pairId);
    if (!createdPair) {
      throw new Error('Failed to fetch created market pair');
    }
    return createdPair;
  }

  async update(id: number | string, entity: Partial<MarketPair>): Promise<MarketPair> {
    await this.updatePair(this.dataSource, id, entity);
    const updatedPair = await this.findById(id);
    if (!updatedPair) {
      throw new Error(`Market pair with id ${id} not found after update`);
    }
    return updatedPair;
  }

  async updateWithinTransaction(
    ctx: TransactionContext,
    id: number | string,
    entity: Partial<MarketPair>,
  ): Promise<MarketPair> {
    const em = getEntityManagerFromTransactionContext(ctx) as unknown as EntityManager;
    await this.updatePair(em, id, entity);
    const updatedPair = await this.findByIdUsingExecutor(em, id);
    if (!updatedPair) {
      throw new Error(`Market pair with id ${id} not found after update`);
    }
    return updatedPair;
  }

  async delete(id: number | string): Promise<void> {
    await this.dataSource.query('DELETE FROM market_pairs WHERE pair_id = $1', [id]);
  }

  private async insertPair(
    executor: SqlExecutor,
    pairId: string,
    entity: Partial<MarketPair>,
  ): Promise<void> {
    await executor.query(
      `INSERT INTO market_pairs (
          pair_id,
          base_currency_id,
          quote_currency_id,
          symbol,
          price_scale,
          amount_scale,
          min_order_amount,
          maker_fee_rate,
          taker_fee_rate,
          is_active,
          created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())`,
      [
        pairId,
        entity.base_currency_id,
        entity.quote_currency_id,
        entity.symbol ? entity.symbol.toUpperCase() : null,
        entity.price_scale ?? 2,
        entity.amount_scale ?? 6,
        entity.min_order_amount ?? '0.0001',
        entity.maker_fee_rate ?? '0.001',
        entity.taker_fee_rate ?? '0.001',
        entity.is_active ?? true,
      ],
    );
  }

  private async updatePair(
    executor: SqlExecutor,
    id: number | string,
    entity: Partial<MarketPair>,
  ): Promise<void> {
    const updates: string[] = [];
    const params: Array<string | number | boolean | null> = [id];

    if (entity.base_currency_id !== undefined) {
      params.push(entity.base_currency_id ?? null);
      updates.push(`base_currency_id = $${params.length}`);
    }
    if (entity.quote_currency_id !== undefined) {
      params.push(entity.quote_currency_id ?? null);
      updates.push(`quote_currency_id = $${params.length}`);
    }
    if (entity.symbol !== undefined) {
      params.push(entity.symbol ? entity.symbol.toUpperCase() : null);
      updates.push(`symbol = $${params.length}`);
    }
    if (entity.price_scale !== undefined) {
      params.push(entity.price_scale);
      updates.push(`price_scale = $${params.length}`);
    }
    if (entity.amount_scale !== undefined) {
      params.push(entity.amount_scale);
      updates.push(`amount_scale = $${params.length}`);
    }
    if (entity.min_order_amount !== undefined) {
      params.push(entity.min_order_amount ?? null);
      updates.push(`min_order_amount = $${params.length}`);
    }
    if (entity.maker_fee_rate !== undefined) {
      params.push(entity.maker_fee_rate ?? null);
      updates.push(`maker_fee_rate = $${params.length}`);
    }
    if (entity.taker_fee_rate !== undefined) {
      params.push(entity.taker_fee_rate ?? null);
      updates.push(`taker_fee_rate = $${params.length}`);
    }
    if (entity.is_active !== undefined) {
      params.push(entity.is_active);
      updates.push(`is_active = $${params.length}`);
    }

    if (updates.length === 0) {
      return;
    }

    await executor.query(
      `UPDATE market_pairs SET ${updates.join(', ')} WHERE pair_id = $1`,
      params,
    );
  }

  private baseSelectSql(whereSql: string): string {
    return `SELECT
        mp.pair_id,
        mp.base_currency_id,
        mp.quote_currency_id,
        mp.symbol,
        mp.price_scale,
        mp.amount_scale,
        mp.min_order_amount,
        mp.maker_fee_rate,
        mp.taker_fee_rate,
        mp.is_active,
        mp.created_at,
        mp.created_at AS updated_at,
        bc.symbol AS base_currency_symbol,
        bc.name AS base_currency_name,
        qc.symbol AS quote_currency_symbol,
        qc.name AS quote_currency_name
      FROM market_pairs mp
      INNER JOIN currencies bc ON bc.currency_id = mp.base_currency_id
      INNER JOIN currencies qc ON qc.currency_id = mp.quote_currency_id
      ${whereSql}`;
  }

  private resolveOrderBy(sortBy: MarketSortBy, sortOrder: 'ASC' | 'DESC'): string {
    switch (sortBy) {
      case 'base':
        return `ORDER BY bc.symbol ${sortOrder}, qc.symbol ASC, mp.symbol ASC`;
      case 'quote':
        return `ORDER BY qc.symbol ${sortOrder}, bc.symbol ASC, mp.symbol ASC`;
      case 'createdAt':
        return `ORDER BY mp.created_at ${sortOrder}, mp.symbol ASC`;
      default:
        return `ORDER BY mp.symbol ${sortOrder}`;
    }
  }

  private mapRowToEntity(row: MarketPairRow): MarketPair {
    const pair = new MarketPair();
    pair.pair_id = String(row.pair_id ?? '');
    pair.base_currency_id = String(row.base_currency_id ?? '');
    pair.quote_currency_id = String(row.quote_currency_id ?? '');
    pair.symbol = String(row.symbol ?? '');
    pair.price_scale = Number(row.price_scale ?? 2);
    pair.amount_scale = Number(row.amount_scale ?? 6);
    pair.min_order_amount = String(row.min_order_amount ?? '0.0001');
    pair.maker_fee_rate = String(row.maker_fee_rate ?? '0.001');
    pair.taker_fee_rate = String(row.taker_fee_rate ?? '0.001');
    pair.is_active = row.is_active === true || row.is_active === 1;
    pair.created_at = row.created_at;
    if (row.base_currency_symbol || row.quote_currency_symbol) {
      pair.base_currency = {
        currency_id: String(row.base_currency_id ?? ''),
        symbol: String(row.base_currency_symbol ?? ''),
        name: String(row.base_currency_name ?? ''),
      } as MarketPair['base_currency'];
      pair.quote_currency = {
        currency_id: String(row.quote_currency_id ?? ''),
        symbol: String(row.quote_currency_symbol ?? ''),
        name: String(row.quote_currency_name ?? ''),
      } as MarketPair['quote_currency'];
    }
    return pair;
  }

  private mapTradeRow(row: TradeRow): Trade {
    const trade = new Trade();
    trade.trade_id = String(row.trade_id ?? '');
    trade.pair_id = String(row.pair_id ?? '');
    trade.taker_order_id = String(row.taker_order_id ?? '');
    trade.maker_order_id = String(row.maker_order_id ?? '');
    trade.price = String(row.price ?? '0');
    trade.amount = String(row.amount ?? '0');
    trade.taker_fee = String(row.taker_fee ?? '0');
    trade.maker_fee = String(row.maker_fee ?? '0');
    trade.fee_currency_id = String(row.fee_currency_id ?? '');
    trade.created_at = row.created_at;
    trade.taker_order = {
      side: row.taker_side ?? 'BUY',
    } as unknown as Trade['taker_order'];
    return trade;
  }
}
