import { Injectable } from '@nestjs/common';
import { BusinessException, ForbiddenException, NotFoundException } from '@/common/exceptions';
import { Order } from '@/entities/order.entity';
import { CancelOrderUseCase } from '@/modules/orders/application/use-cases/cancel-order.use-case';
import { CreateOrderUseCase } from '@/modules/orders/application/use-cases/create-order.use-case';
import { ListOpenOrdersForPairQuery } from '@/modules/orders/application/queries/list-open-orders-for-pair.query';
import type { CancelOrderCommand } from './commands/cancel-order.command';
import type { CreateOrderCommand } from './commands/create-order.command';
import type { CancelBatchOrderDto, CreateBatchOrderDto } from './dto';
import { OrderRepository } from './repositories';

const MAX_BATCH_ORDERS = 20;

@Injectable()
export class OrdersService {
  constructor(
    private readonly orderRepository: OrderRepository,
    private readonly createOrderUseCase: CreateOrderUseCase,
    private readonly cancelOrderUseCase: CancelOrderUseCase,
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

  async findOne(orderId: string, userId: string): Promise<Order> {
    const order = await this.orderRepository.findById(orderId);
    if (!order) {
      throw new NotFoundException('Order', orderId);
    }
    if (order.user_id !== userId) {
      throw new ForbiddenException('Access denied');
    }
    return order;
  }

  getOrderBook(pairId: string, side: 'BUY' | 'SELL', limit: number = 50) {
    return this.orderRepository.getOrderBook(pairId, side, limit);
  }

  async findAllForAdmin(params: {
    userId?: string;
    pairId?: string;
    status?: string;
    page: number;
    limit: number;
  }) {
    const skip = (params.page - 1) * params.limit;
    const { items, total } = await this.orderRepository.findAllForAdmin({
      userId: params.userId,
      pairId: params.pairId,
      status: params.status,
      skip,
      limit: params.limit,
    });
    return {
      data: items.map((o) => this.orderToAdminPlain(o)),
      total,
      page: params.page,
      limit: params.limit,
    };
  }

  async findOrdersByUser(userId: string, page: number = 1, limit: number = 20, status?: string) {
    const skip = (page - 1) * limit;
    const { items, total } = await this.orderRepository.findByUserForAdmin(
      userId,
      skip,
      limit,
      status,
    );
    return {
      data: items.map((o) => this.orderToAdminPlain(o)),
      total,
      page,
      limit,
    };
  }

  private orderToPlain(o: Order): Record<string, any> {
    return {
      order_id: o.order_id,
      user_id: o.user_id,
      pair_id: o.pair_id,
      side: o.side,
      type: o.type,
      price: o.price,
      amount: o.amount,
      filled_amount: o.filled_amount,
      avg_price: o.avg_price,
      status: o.status,
      time_in_force: o.time_in_force,
      reserved_quote: o.reserved_quote,
      reserved_base: o.reserved_base,
      client_order_id: o.client_order_id,
      idempotency_key: o.idempotency_key,
      slippage_tolerance: o.slippage_tolerance,
      created_at: o.created_at,
      updated_at: o.updated_at,
    };
  }

  private orderToAdminPlain(o: Order): Record<string, any> {
    return {
      ...this.orderToPlain(o),
      pair_symbol: o.pair?.symbol ?? '',
    };
  }
}
