import { Inject, Injectable } from '@nestjs/common';
import { ForbiddenException, NotFoundException } from '@/common/exceptions';
import type { Order } from '@/entities/order.entity';
import { ORDER_REPOSITORY, type OrderRepositoryPort } from '@/modules/orders/domain/ports';

@Injectable()
export class FindOneOrderQuery {
  constructor(
    @Inject(ORDER_REPOSITORY)
    private readonly orderRepository: OrderRepositoryPort,
  ) {}

  async execute(orderId: string, userId: string): Promise<Order> {
    const order = await this.orderRepository.findById(orderId);
    if (!order) {
      throw new NotFoundException('Order', orderId);
    }
    if (order.user_id !== userId) {
      throw new ForbiddenException('Access denied');
    }
    return order;
  }
}
