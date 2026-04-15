import { Inject, Injectable } from '@nestjs/common';
import type { Order } from '@/entities/order.entity';
import { ORDER_REPOSITORY, type OrderRepositoryPort } from '@/modules/orders/domain/ports';

@Injectable()
export class FindOrdersByUserQuery {
  constructor(
    @Inject(ORDER_REPOSITORY)
    private readonly orderRepository: OrderRepositoryPort,
  ) {}

  async execute(userId: string, page: number = 1, limit: number = 20, status?: string) {
    const skip = (page - 1) * limit;
    const { items, total } = await this.orderRepository.findByUserForAdmin(
      userId,
      skip,
      limit,
      status,
    );
    return {
      data: items.map((o) => this.toAdminPlain(o)),
      total,
      page,
      limit,
    };
  }

  private toAdminPlain(o: Order): Record<string, any> {
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
      pair_symbol: o.pair?.symbol ?? '',
    };
  }
}
