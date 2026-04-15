import { Inject, Injectable } from '@nestjs/common';
import type { Order } from '@/entities/order.entity';
import { ORDER_REPOSITORY, type OrderRepositoryPort } from '@/modules/orders/domain/ports';

@Injectable()
export class ListOpenOrdersForPairQuery {
  constructor(
    @Inject(ORDER_REPOSITORY)
    private readonly orderRepository: OrderRepositoryPort,
  ) {}

  execute(userId: string, pairId: string): Promise<Order[]> {
    return this.orderRepository.findOpenByUserPair(userId, pairId);
  }
}
