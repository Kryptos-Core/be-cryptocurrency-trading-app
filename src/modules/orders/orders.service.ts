import { Inject, Injectable } from '@nestjs/common';
import { BusinessException } from '@/common/exceptions';
import type { Order } from '@/entities/order.entity';
import { CancelOrderUseCase } from '@/modules/orders/application/use-cases/cancel-order.use-case';
import { CreateOrderUseCase } from '@/modules/orders/application/use-cases/create-order.use-case';
import { FindAllOrdersAdminQuery } from '@/modules/orders/application/queries/find-all-orders-admin.query';
import { FindOneOrderQuery } from '@/modules/orders/application/queries/find-one-order.query';
import { FindOrdersByUserQuery } from '@/modules/orders/application/queries/find-orders-by-user.query';
import { GetOrderBookQuery } from '@/modules/orders/application/queries/get-order-book.query';
import { ListOpenOrdersForPairQuery } from '@/modules/orders/application/queries/list-open-orders-for-pair.query';
import type { CancelOrderCommand } from './commands/cancel-order.command';
import type { CreateOrderCommand } from './commands/create-order.command';
import type { CancelBatchOrderDto, CreateBatchOrderDto } from './dto';

const MAX_BATCH_ORDERS = 20;

/**
 * Transitional facade that keeps the current controller contract while
 * delegating all behavior to application use cases and queries.
 */
@Injectable()
export class OrdersService {
  constructor(
    private readonly createOrderUseCase: CreateOrderUseCase,
    private readonly cancelOrderUseCase: CancelOrderUseCase,
    private readonly findOneOrderQuery: FindOneOrderQuery,
    private readonly getOrderBookQuery: GetOrderBookQuery,
    private readonly findAllOrdersAdminQuery: FindAllOrdersAdminQuery,
    private readonly findOrdersByUserQuery: FindOrdersByUserQuery,
    private readonly listOpenOrdersForPairQuery: ListOpenOrdersForPairQuery,
  ) {}

  create(command: CreateOrderCommand): Promise<Order> {
    return this.createOrderUseCase.execute(command as any);
  }

  cancel(command: CancelOrderCommand): Promise<Order> {
    return this.cancelOrderUseCase.execute(command as any);
  }

  async createBatch(command: { userId: string; dto: CreateBatchOrderDto }): Promise<{
    created: Order[];
    count: number;
  }> {
    const { userId, dto } = command;
    if (dto.orders.length > MAX_BATCH_ORDERS) {
      throw new BusinessException(
        `Batch size exceeds ${MAX_BATCH_ORDERS} orders`,
        'BATCH_SIZE_EXCEEDED',
      );
    }

    const created = await Promise.all(
      dto.orders.map((orderDto) => this.create({ userId, dto: orderDto } as any)),
    );

    return { created, count: created.length };
  }

  async cancelBatch(command: { userId: string; dto: CancelBatchOrderDto }): Promise<{
    cancelled: Order[];
    count: number;
  }> {
    const { userId, dto } = command;
    if (dto.orderIds.length > MAX_BATCH_ORDERS) {
      throw new BusinessException(
        `Batch size exceeds ${MAX_BATCH_ORDERS} orders`,
        'BATCH_SIZE_EXCEEDED',
      );
    }

    const cancelled = await Promise.all(
      dto.orderIds.map((orderId) =>
        this.cancel({ userId, orderId, idempotencyKey: dto.idempotencyKey } as any),
      ),
    );

    return { cancelled, count: cancelled.length };
  }

  listOpenOrdersForPair(userId: string, pairId: string): Promise<Order[]> {
    return this.listOpenOrdersForPairQuery.execute(userId, pairId);
  }

  async cancelOpenOrdersForPair(userId: string, pairId: string): Promise<Order[]> {
    const openOrders = await this.listOpenOrdersForPairQuery.execute(userId, pairId);
    if (openOrders.length === 0) {
      return [];
    }
    return Promise.all(
      openOrders.map((order) => this.cancel({ userId, orderId: order.order_id } as any)),
    );
  }

  findOne(orderId: string, userId: string): Promise<Order> {
    return this.findOneOrderQuery.execute(orderId, userId);
  }

  getOrderBook(pairId: string, side: 'BUY' | 'SELL', limit: number = 50) {
    return this.getOrderBookQuery.execute(pairId, side, limit);
  }

  findAllForAdmin(params: {
    userId?: string;
    pairId?: string;
    status?: string;
    page: number;
    limit: number;
  }) {
    return this.findAllOrdersAdminQuery.execute(params);
  }

  findOrdersByUser(userId: string, page: number = 1, limit: number = 20, status?: string) {
    return this.findOrdersByUserQuery.execute(userId, page, limit, status);
  }
}
