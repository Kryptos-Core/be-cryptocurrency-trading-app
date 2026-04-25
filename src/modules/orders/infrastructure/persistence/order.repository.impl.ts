import { Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { BaseRepository } from '@/common/repositories';
import { MarketPair } from '@/entities/market-pair.entity';
import { Order } from '@/entities/order.entity';
import { Wallet } from '@/entities/wallet.entity';
import type {
  CancelOrderProcedureResult,
  CreateOrderProcedureResult,
  OrderBookLevel,
  OrderRepositoryPort,
} from '@/modules/orders/domain/ports';

type DbExecutor = Pick<DataSource, 'query'> | Pick<EntityManager, 'query'>;
type MarketPairRow = Pick<
  MarketPair,
  'pair_id' | 'base_currency_id' | 'quote_currency_id' | 'min_order_amount' | 'is_active'
>;
type WalletRow = Pick<Wallet, 'wallet_id' | 'available' | 'frozen'>;
type OrderRow = Record<string, unknown>;

function toNumeric(value: string | number | null | undefined): number {
  return Number(value ?? 0);
}

@Injectable()
export class OrderRepositoryImpl extends BaseRepository<Order> implements OrderRepositoryPort {
  constructor(dataSource: DataSource) {
    super(Order, dataSource);
  }

  override async findById(id: string): Promise<Order | null> {
    const rows = await this.dataSource.query(
      `SELECT order_id, user_id, pair_id, side, type, price, amount, filled_amount, avg_price,
              status, time_in_force, reserved_quote, reserved_base, client_order_id, idempotency_key,
              slippage_tolerance, created_at, updated_at
       FROM orders
       WHERE order_id = $1
       LIMIT 1`,
      [id],
    );
    return rows?.[0] ? this.mapRowToOrder(rows[0]) : null;
  }

  async findByUserIdempotency(userId: string, idempotencyKey: string): Promise<Order | null> {
    const rows = await this.dataSource.query(
      `SELECT order_id, user_id, pair_id, side, type, price, amount, filled_amount, avg_price,
              status, time_in_force, reserved_quote, reserved_base, client_order_id, idempotency_key,
              slippage_tolerance, created_at, updated_at
       FROM orders
       WHERE user_id = $1 AND idempotency_key = $2
       LIMIT 1`,
      [userId, idempotencyKey],
    );
    return rows?.[0] ? this.mapRowToOrder(rows[0]) : null;
  }

  async findBestLimitSellPrice(pairId: string): Promise<string | null> {
    const rows = await this.dataSource.query(
      `SELECT MIN(price) AS best_ask
       FROM orders
       WHERE TRIM(pair_id) = $1 AND side = 'SELL' AND type = 'LIMIT'
         AND status IN ('OPEN', 'PARTIAL') AND price IS NOT NULL AND price > 0`,
      [pairId.trim()],
    );
    const raw = rows?.[0]?.best_ask;
    return raw == null || raw === '' ? null : String(raw);
  }

  async getOrderBook(
    pairId: string,
    side: 'BUY' | 'SELL',
    limit: number = 50,
  ): Promise<OrderBookLevel[]> {
    const rows = await this.dataSource.query(
      `SELECT price::text AS price,
              SUM(amount - filled_amount)::text AS remaining,
              COUNT(*)::int AS order_count
       FROM orders
       WHERE pair_id = $1
         AND side = $2
         AND status IN ('OPEN', 'PARTIAL')
         AND price IS NOT NULL
         AND price > 0
       GROUP BY price
       ORDER BY
         CASE WHEN $2 = 'BUY' THEN price END DESC,
         CASE WHEN $2 = 'SELL' THEN price END ASC
       LIMIT $3`,
      [pairId, side, Math.max(1, Math.trunc(limit || 50))],
    );

    return (rows ?? []).map((row: Record<string, unknown>) => ({
      price: String(row.price ?? '0'),
      remaining: String(row.remaining ?? '0'),
      order_count: Number(row.order_count ?? 0),
    }));
  }

  async createOrderViaProcedure(params: {
    orderId: string;
    userId: string;
    pairId: string;
    side: 'BUY' | 'SELL';
    type: 'LIMIT' | 'MARKET';
    price: string | null;
    amount: string;
    timeInForce: string;
    clientOrderId: string | null;
    idempotencyKey: string;
    slippageTolerance: string | null;
    marketBuyReservedQuote: string | null;
  }): Promise<CreateOrderProcedureResult> {
    return this.dataSource.transaction(async (manager) => {
      const pair = await this.findActivePairForUpdate(manager, params.pairId);
      if (!pair) {
        return this.createError('PAIR_NOT_FOUND', 'Market pair not found or inactive');
      }

      if (params.type === 'LIMIT' && (params.price == null || toNumeric(params.price) <= 0)) {
        return this.createError('INVALID_PRICE', 'Limit order requires positive price');
      }

      if (params.amount == null || toNumeric(params.amount) < toNumeric(pair.min_order_amount)) {
        return this.createError('INVALID_AMOUNT', 'Amount below minimum');
      }

      let reserveQuote = '0';
      let reserveBase = '0';

      if (params.side === 'BUY') {
        if (params.type === 'LIMIT') {
          reserveQuote = String(toNumeric(params.amount) * toNumeric(params.price));
        } else {
          if (params.marketBuyReservedQuote == null || toNumeric(params.marketBuyReservedQuote) <= 0) {
            return this.createError(
              'INVALID_MARKET_BUY_RESERVE',
              'MARKET BUY requires a positive reserved quote',
            );
          }
          reserveQuote = String(params.marketBuyReservedQuote);
        }

        const quoteWallet = await this.findWalletForUpdate(
          manager,
          params.userId,
          String(pair.quote_currency_id),
        );
        if (!quoteWallet || toNumeric(quoteWallet.available) < toNumeric(reserveQuote)) {
          return this.createError('INSUFFICIENT_BALANCE', 'Insufficient quote balance');
        }

        await manager.query(
          `UPDATE wallets
           SET available = available - $1::numeric,
               frozen = frozen + $1::numeric,
               updated_at = NOW()
           WHERE wallet_id = $2`,
          [reserveQuote, quoteWallet.wallet_id],
        );
      } else {
        reserveBase = String(params.amount);
        const baseWallet = await this.findWalletForUpdate(
          manager,
          params.userId,
          String(pair.base_currency_id),
        );
        if (!baseWallet || toNumeric(baseWallet.available) < toNumeric(reserveBase)) {
          return this.createError('INSUFFICIENT_BALANCE', 'Insufficient base balance');
        }

        await manager.query(
          `UPDATE wallets
           SET available = available - $1::numeric,
               frozen = frozen + $1::numeric,
               updated_at = NOW()
           WHERE wallet_id = $2`,
          [reserveBase, baseWallet.wallet_id],
        );
      }

      await manager.query(
        `INSERT INTO orders (
          order_id, user_id, pair_id, side, type, price, amount, filled_amount, status,
          time_in_force, reserved_quote, reserved_base, client_order_id, idempotency_key,
          slippage_tolerance, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, 0, 'OPEN',
          COALESCE(NULLIF($8, ''), 'GTC'), $9, $10, $11, $12, $13, NOW(), NOW()
        )`,
        [
          params.orderId,
          params.userId,
          params.pairId,
          params.side,
          params.type,
          params.price,
          params.amount,
          params.timeInForce,
          reserveQuote,
          reserveBase,
          params.clientOrderId,
          params.idempotencyKey,
          params.slippageTolerance,
        ],
      );

      return {
        order_id: params.orderId,
        error_code: null,
        error_message: null,
      };
    });
  }

  async cancelOrderViaProcedure(
    orderId: string,
    userId: string,
  ): Promise<CancelOrderProcedureResult> {
    return this.dataSource.transaction(async (manager) => {
      const row = await this.findOrderForUpdate(manager, orderId);
      if (!row) {
        return { cancelled: 0, error_code: 'ORDER_NOT_FOUND', error_message: 'Order not found' };
      }

      const order = this.mapRowToOrder(row);
      if (order.user_id !== userId) {
        return { cancelled: 0, error_code: 'FORBIDDEN', error_message: 'Forbidden' };
      }
      if (!['OPEN', 'PARTIAL'].includes(order.status)) {
        return {
          cancelled: 0,
          error_code: 'INVALID_STATE',
          error_message: `Order cannot be cancelled (status: ${order.status})`,
        };
      }

      const pair = await this.findPair(manager, order.pair_id);
      if (!pair) {
        return { cancelled: 0, error_code: 'PAIR_NOT_FOUND', error_message: 'Market pair not found' };
      }

      const releaseAmount = order.side === 'BUY' ? order.reserved_quote : order.reserved_base;
      if (toNumeric(releaseAmount) > 0) {
        const releaseCurrencyId =
          order.side === 'BUY' ? String(pair.quote_currency_id) : String(pair.base_currency_id);
        const wallet = await this.findWalletForUpdate(manager, order.user_id, releaseCurrencyId);
        if (!wallet) {
          return { cancelled: 0, error_code: 'WALLET_NOT_FOUND', error_message: 'Wallet not found' };
        }

        await manager.query(
          `UPDATE wallets
           SET available = available + $1::numeric,
               frozen = GREATEST(0, frozen - $1::numeric),
               updated_at = NOW()
           WHERE wallet_id = $2`,
          [releaseAmount, wallet.wallet_id],
        );
      }

      await manager.query(
        `UPDATE orders
         SET status = 'CANCELLED',
             reserved_quote = CASE WHEN side = 'BUY' THEN 0 ELSE reserved_quote END,
             reserved_base = CASE WHEN side = 'SELL' THEN 0 ELSE reserved_base END,
             updated_at = NOW()
         WHERE order_id = $1`,
        [orderId],
      );

      return { cancelled: 1, error_code: null, error_message: null };
    });
  }

  async findByUser(
    userId: string,
    status: string | null,
    skip: number,
    limit: number,
  ): Promise<Order[]> {
    const rows = await this.dataSource.query(
      `SELECT order_id, user_id, pair_id, side, type, price, amount, filled_amount, avg_price,
              status, time_in_force, reserved_quote, reserved_base, client_order_id, idempotency_key,
              slippage_tolerance, created_at, updated_at
       FROM orders
       WHERE user_id = $1
         AND ($2::text IS NULL OR $2 = '' OR status = $2)
       ORDER BY created_at DESC
       OFFSET $3
       LIMIT $4`,
      [userId, status, skip, limit],
    );
    return (rows ?? []).map((row: OrderRow) => this.mapRowToOrder(row));
  }

  async countByUser(userId: string, status: string | null): Promise<number> {
    const rows = await this.dataSource.query(
      `SELECT COUNT(*)::int AS total
       FROM orders
       WHERE user_id = $1
         AND ($2::text IS NULL OR $2 = '' OR status = $2)`,
      [userId, status],
    );
    return Number(rows?.[0]?.total ?? 0);
  }

  async findAllForAdmin(params: {
    userId?: string;
    pairId?: string;
    status?: string;
    skip: number;
    limit: number;
  }): Promise<{ items: Order[]; total: number }> {
    const repo = this.dataSource.getRepository(Order);
    const qb = repo
      .createQueryBuilder('o')
      .leftJoinAndSelect('o.pair', 'pair')
      .orderBy('o.created_at', 'DESC');

    if (params.userId) qb.andWhere('o.user_id = :userId', { userId: params.userId });
    if (params.pairId) qb.andWhere('o.pair_id = :pairId', { pairId: params.pairId });
    if (params.status) qb.andWhere('o.status = :status', { status: params.status });

    const [items, total] = await qb.skip(params.skip).take(params.limit).getManyAndCount();
    return { items, total };
  }

  async findByUserForAdmin(
    userId: string,
    skip: number,
    limit: number,
    status?: string,
  ): Promise<{ items: Order[]; total: number }> {
    return this.findAllForAdmin({ userId, status, skip, limit });
  }

  async findOpenByUserPair(userId: string, pairId: string): Promise<Order[]> {
    return this.dataSource
      .getRepository(Order)
      .createQueryBuilder('o')
      .where('o.user_id = :userId', { userId })
      .andWhere('o.pair_id = :pairId', { pairId })
      .andWhere('o.status IN (:...statuses)', { statuses: ['OPEN', 'PARTIAL'] })
      .orderBy('o.created_at', 'ASC')
      .getMany();
  }

  private createError(error_code: string, error_message: string): CreateOrderProcedureResult {
    return { order_id: null, error_code, error_message };
  }

  private async findActivePairForUpdate(executor: DbExecutor, pairId: string): Promise<MarketPairRow | null> {
    const rows = await executor.query(
      `SELECT pair_id, base_currency_id, quote_currency_id, min_order_amount, is_active
       FROM market_pairs
       WHERE pair_id = $1 AND is_active = true
       FOR UPDATE`,
      [pairId],
    );
    return (rows?.[0] as MarketPairRow | undefined) ?? null;
  }

  private async findPair(executor: DbExecutor, pairId: string): Promise<MarketPairRow | null> {
    const rows = await executor.query(
      `SELECT pair_id, base_currency_id, quote_currency_id, min_order_amount, is_active
       FROM market_pairs
       WHERE pair_id = $1
       LIMIT 1`,
      [pairId],
    );
    return (rows?.[0] as MarketPairRow | undefined) ?? null;
  }

  private async findWalletForUpdate(
    executor: DbExecutor,
    userId: string,
    currencyId: string,
  ): Promise<WalletRow | null> {
    const rows = await executor.query(
      `SELECT wallet_id, available, frozen
       FROM wallets
       WHERE user_id = $1 AND currency_id = $2
       LIMIT 1
       FOR UPDATE`,
      [userId, currencyId],
    );
    return (rows?.[0] as WalletRow | undefined) ?? null;
  }

  private async findOrderForUpdate(executor: DbExecutor, orderId: string): Promise<OrderRow | null> {
    const rows = await executor.query(
      `SELECT order_id, user_id, pair_id, side, type, price, amount, filled_amount, avg_price,
              status, time_in_force, reserved_quote, reserved_base, client_order_id, idempotency_key,
              slippage_tolerance, created_at, updated_at
       FROM orders
       WHERE order_id = $1
       FOR UPDATE`,
      [orderId],
    );
    return (rows?.[0] as OrderRow | undefined) ?? null;
  }

  private mapRowToOrder(row: OrderRow): Order {
    const order = new Order();
    order.order_id = String(row.order_id ?? '');
    order.user_id = String(row.user_id ?? '');
    order.pair_id = String(row.pair_id ?? '');
    order.side = row.side as Order['side'];
    order.type = row.type as Order['type'];
    order.price = row.price != null ? String(row.price) : null;
    order.amount = String(row.amount ?? '0');
    order.filled_amount = String(row.filled_amount ?? '0');
    order.avg_price = row.avg_price != null ? String(row.avg_price) : null;
    order.status = row.status as Order['status'];
    order.time_in_force = (row.time_in_force as Order['time_in_force'] | null) ?? 'GTC';
    order.reserved_quote = String(row.reserved_quote ?? '0');
    order.reserved_base = String(row.reserved_base ?? '0');
    order.client_order_id = row.client_order_id != null ? String(row.client_order_id) : null;
    order.idempotency_key = String(row.idempotency_key ?? '');
    order.slippage_tolerance = row.slippage_tolerance != null ? String(row.slippage_tolerance) : null;
    order.created_at = row.created_at as Date;
    order.updated_at = row.updated_at as Date;
    return order;
  }
}
