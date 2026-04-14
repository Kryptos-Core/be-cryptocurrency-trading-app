import { Injectable } from '@nestjs/common';
import { Order } from '@/entities/order.entity';
import { OrderRepository } from '@/modules/orders/repositories';

@Injectable()
export class ListOpenOrdersForPairQuery {
  constructor(private readonly orderRepository: OrderRepository) {}

  execute(userId: string, pairId: string): Promise<Order[]> {
    return this.orderRepository.findOpenByUserPair(userId, pairId);
  }
}
