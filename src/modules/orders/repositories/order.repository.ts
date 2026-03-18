import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { BaseRepository } from '@/common/repositories';
import { Order } from '@/entities/order.entity';

export interface OrderBookLevel {
  price: string;
  remaining: string;
  order_count: number;
}

export interface CreateOrderProcedureResult {
  order_id: string | null;
  error_code: string | null;
  error_message: string | null;
}

export interface CancelOrderProcedureResult {
  cancelled: number;
  error_code: string | null;
  error_message: string | null;
}

/**
 * Order Repository
 * Repository Pattern: Data access for orders via stored procedures.
 * Database Procedure Pattern: sp_order_* procedures.
 */
@Injectable()
export class OrderRepository extends BaseRepository<Order> {
  constructor(dataSource: DataSource) {
    super(Order, dataSource);
  }

  override async findById(id: string): Promise<Order | null> {
    try {
      const result = await this.dataSource.query('CALL sp_order_find_by_id(?)', [
        id,
      ]);
      if (!result?.[0]?.[0]) return null;
      return this.mapRowToOrder(result[0][0]);
    } catch (error) {
      this.logger.error(`Error finding order by id: ${id}`, error);
      throw error;
    }
  }

  async findByUserIdempotency(
    userId: string,
    idempotencyKey: string,
  ): Promise<Order | null> {
    try {
      const result = await this.dataSource.query(
        'CALL sp_order_find_by_user_idempotency(?, ?)',
        [userId, idempotencyKey],
      );
      if (!result?.[0]?.[0]) return null;
      return this.mapRowToOrder(result[0][0]);
    } catch (error) {
      this.logger.error(
        `Error finding order by idempotency: user=${userId}, key=${idempotencyKey}`,
        error,
      );
      throw error;
    }
  }

  async getOrderBook(
    pairId: string,
    side: 'BUY' | 'SELL',
    limit: number = 50,
  ): Promise<OrderBookLevel[]> {
    try {
      const result = await this.dataSource.query('CALL sp_order_book(?, ?, ?)', [
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
    } catch (error) {
      this.logger.error(
        `Error getting order book: pair=${pairId}, side=${side}`,
        error,
      );
      throw error;
    }
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
  }): Promise<CreateOrderProcedureResult> {
    try {
      await this.dataSource.query(
        'CALL sp_order_create(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, @p_error_code, @p_error_message)',
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
    } catch (error) {
      this.logger.error('Error creating order via procedure', error);
      throw error;
    }
  }

  async cancelOrderViaProcedure(
    orderId: string,
    userId: string,
  ): Promise<CancelOrderProcedureResult> {
    try {
      await this.dataSource.query(
        'CALL sp_order_cancel(?, ?, @p_cancelled, @p_error_code, @p_error_message)',
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
    } catch (error) {
      this.logger.error(`Error cancelling order: ${orderId}`, error);
      throw error;
    }
  }

  async findByUser(
    userId: string,
    status: string | null,
    skip: number,
    limit: number,
  ): Promise<Order[]> {
    try {
      const result = await this.dataSource.query(
        'CALL sp_order_find_by_user(?, ?, ?, ?)',
        [userId, status ?? '', skip, limit],
      );
      const rows = result?.[0] ?? [];
      return rows.map((r: any) => this.mapRowToOrder(r));
    } catch (error) {
      this.logger.error(`Error finding orders by user: ${userId}`, error);
      throw error;
    }
  }

  async countByUser(
    userId: string,
    status: string | null,
  ): Promise<number> {
    try {
      const result = await this.dataSource.query(
        'CALL sp_order_count_by_user(?, ?)',
        [userId, status ?? ''],
      );
      const total = result?.[0]?.[0]?.total;
      return Number(total ?? 0);
    } catch (error) {
      this.logger.error(`Error counting orders by user: ${userId}`, error);
      throw error;
    }
  }

  /** Admin: paginated list of all orders with optional filters */
  async findAllForAdmin(params: {
    userId?: string;
    pairId?: string;
    status?: string;
    skip: number;
    limit: number;
  }): Promise<{ items: Order[]; total: number }> {
    const repo = this.dataSource.getRepository(Order);
    const qb = repo.createQueryBuilder('o').orderBy('o.created_at', 'DESC');

    if (params.userId) qb.andWhere('o.user_id = :userId', { userId: params.userId });
    if (params.pairId) qb.andWhere('o.pair_id = :pairId', { pairId: params.pairId });
    if (params.status) qb.andWhere('o.status = :status', { status: params.status });

    const [items, total] = await qb
      .skip(params.skip)
      .take(params.limit)
      .getManyAndCount();

    return { items, total };
  }

  /** Admin: orders for a specific user (used by GET /users/:id/orders) */
  async findByUserForAdmin(
    userId: string,
    skip: number,
    limit: number,
    status?: string,
  ): Promise<{ items: Order[]; total: number }> {
    return this.findAllForAdmin({ userId, status, skip, limit });
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
    order.created_at = row.created_at;
    order.updated_at = row.updated_at;
    return order;
  }
}
