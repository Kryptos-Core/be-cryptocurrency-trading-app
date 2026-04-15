import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ORDER_STORE_PROCEDURE } from '@/common/constants/stored-procedure-names';
import { BaseRepository } from '@/common/repositories';
import { Order } from '@/entities/order.entity';
import type {
  CancelOrderProcedureResult,
  CreateOrderProcedureResult,
  OrderBookLevel,
  OrderRepositoryPort,
} from '@/modules/orders/domain/ports';

/**
 * Infrastructure: Order Repository (TypeORM + stored procedures)
 * Implements OrderRepositoryPort for the persistence layer.
 */
@Injectable()
export class OrderRepositoryImpl extends BaseRepository<Order> implements OrderRepositoryPort {
  constructor(dataSource: DataSource) {
    super(Order, dataSource);
  }

  override async findById(id: string): Promise<Order | null> {
    const result = await this.dataSource.query(`CALL ${ORDER_STORE_PROCEDURE.FIND_BY_ID}(?)`, [id]);
    if (!result?.[0]?.[0]) return null;
    return this.mapRowToOrder(result[0][0]);
  }

  async findByUserIdempotency(userId: string, idempotencyKey: string): Promise<Order | null> {
    const result = await this.dataSource.query(
      `CALL ${ORDER_STORE_PROCEDURE.FIND_BY_USER_IDEMPOTENCY}(?, ?)`,
      [userId, idempotencyKey],
    );
    if (!result?.[0]?.[0]) return null;
    return this.mapRowToOrder(result[0][0]);
  }

  async findBestLimitSellPrice(pairId: string): Promise<string | null> {
    const trimmed = pairId.trim();
    const rows = await this.dataSource.query(
      `SELECT MIN(price) AS best_ask FROM orders
       WHERE TRIM(pair_id) = ? AND side = 'SELL' AND type = 'LIMIT'
         AND status IN ('OPEN', 'PARTIAL') AND price IS NOT NULL AND price > 0`,
      [trimmed],
    );
    const raw = rows?.[0]?.best_ask;
    if (raw == null || raw === '') return null;
    return String(raw);
  }

  async getOrderBook(
    pairId: string,
    side: 'BUY' | 'SELL',
    limit: number = 50,
  ): Promise<OrderBookLevel[]> {
    const result = await this.dataSource.query(`CALL ${ORDER_STORE_PROCEDURE.BOOK}(?, ?, ?)`, [
      pairId,
      side,
      limit,
    ]);
    const rows = result?.[0] ?? [];
    return rows
      .filter((r: any) => {
        const p = r?.price;
        if (p == null) return false;
        const n = Number(p);
        return Number.isFinite(n) && n > 0;
      })
      .map((r: any) => ({
        price: String(r.price ?? '0'),
        remaining: String(r.remaining ?? '0'),
        order_count: Number(r.order_count ?? 0),
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
    await this.dataSource.query(
      `CALL ${ORDER_STORE_PROCEDURE.CREATE}(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, @p_error_code, @p_error_message)`,
      [
        params.orderId,
        params.userId,
        params.pairId,
        params.side,
        params.type,
        params.price ?? null,
        params.amount,
        params.timeInForce,
        params.clientOrderId ?? null,
        params.idempotencyKey,
        params.slippageTolerance,
        params.marketBuyReservedQuote,
      ],
    );
    const [out] = await this.dataSource.query(
      'SELECT @p_error_code AS error_code, @p_error_message AS error_message',
    );
    return {
      order_id: out?.error_code ? null : params.orderId,
      error_code: out?.error_code ?? null,
      error_message: out?.error_message ?? null,
    };
  }

  async cancelOrderViaProcedure(
    orderId: string,
    userId: string,
  ): Promise<CancelOrderProcedureResult> {
    await this.dataSource.query(
      `CALL ${ORDER_STORE_PROCEDURE.CANCEL}(?, ?, @p_cancelled, @p_error_code, @p_error_message)`,
      [orderId, userId],
    );
    const [out] = await this.dataSource.query(
      'SELECT @p_cancelled AS cancelled, @p_error_code AS error_code, @p_error_message AS error_message',
    );
    return {
      cancelled: Number(out?.cancelled ?? 0),
      error_code: out?.error_code ?? null,
      error_message: out?.error_message ?? null,
    };
  }

  async findByUser(
    userId: string,
    status: string | null,
    skip: number,
    limit: number,
  ): Promise<Order[]> {
    const result = await this.dataSource.query(
      `CALL ${ORDER_STORE_PROCEDURE.FIND_BY_USER}(?, ?, ?, ?)`,
      [userId, status ?? '', skip, limit],
    );
    const rows = result?.[0] ?? [];
    return rows.map((r: any) => this.mapRowToOrder(r));
  }

  async countByUser(userId: string, status: string | null): Promise<number> {
    const result = await this.dataSource.query(
      `CALL ${ORDER_STORE_PROCEDURE.COUNT_BY_USER}(?, ?)`,
      [userId, status ?? ''],
    );
    const total = result?.[0]?.[0]?.total;
    return Number(total ?? 0);
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

  private mapRowToOrder(row: any): Order {
    const order = new Order();
    order.order_id = String(row.order_id ?? '');
    order.user_id = String(row.user_id ?? '');
    order.pair_id = String(row.pair_id ?? '');
    order.side = row.side;
    order.type = row.type;
    order.price = row.price != null ? String(row.price) : (null as any);
    order.amount = String(row.amount ?? '0');
    order.filled_amount = String(row.filled_amount ?? '0');
    order.avg_price = row.avg_price != null ? String(row.avg_price) : (null as any);
    order.status = row.status;
    order.time_in_force = row.time_in_force ?? 'GTC';
    order.reserved_quote = String(row.reserved_quote ?? '0');
    order.reserved_base = String(row.reserved_base ?? '0');
    order.client_order_id = row.client_order_id ?? (null as any);
    order.idempotency_key = row.idempotency_key ?? '';
    order.slippage_tolerance =
      row.slippage_tolerance != null ? String(row.slippage_tolerance) : null;
    order.created_at = row.created_at;
    order.updated_at = row.updated_at;
    return order;
  }
}
