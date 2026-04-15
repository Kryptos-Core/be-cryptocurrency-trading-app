import type { EntityManager } from 'typeorm';
import type { Order } from '@/entities/order.entity';

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
 * Port: Order Repository abstraction.
 * Application and domain layers depend on this interface, not the concrete implementation.
 */
export interface OrderRepositoryPort {
  findById(id: string): Promise<Order | null>;
  findByUserIdempotency(userId: string, idempotencyKey: string): Promise<Order | null>;
  findBestLimitSellPrice(pairId: string): Promise<string | null>;

  getOrderBook(pairId: string, side: 'BUY' | 'SELL', limit?: number): Promise<OrderBookLevel[]>;

  createOrderViaProcedure(params: {
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
  }): Promise<CreateOrderProcedureResult>;

  cancelOrderViaProcedure(
    orderId: string,
    userId: string,
  ): Promise<CancelOrderProcedureResult>;

  findByUser(
    userId: string,
    status: string | null,
    skip: number,
    limit: number,
  ): Promise<Order[]>;

  countByUser(userId: string, status: string | null): Promise<number>;

  findAllForAdmin(params: {
    userId?: string;
    pairId?: string;
    status?: string;
    skip: number;
    limit: number;
  }): Promise<{ items: Order[]; total: number }>;

  findByUserForAdmin(
    userId: string,
    skip: number,
    limit: number,
    status?: string,
  ): Promise<{ items: Order[]; total: number }>;

  findOpenByUserPair(userId: string, pairId: string): Promise<Order[]>;

  /** Transactional helper (from BaseRepository) */
  transaction<T>(work: (manager: EntityManager) => Promise<T>): Promise<T>;
}

export const ORDER_REPOSITORY = Symbol('ORDER_REPOSITORY');
