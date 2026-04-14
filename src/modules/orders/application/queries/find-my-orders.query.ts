import { Injectable } from '@nestjs/common';
import { calcSkip } from '@/common/utils/pagination.util';
import { OrderRepository } from '@/modules/orders/repositories';

@Injectable()
export class FindMyOrdersQuery {
  constructor(private readonly orderRepository: OrderRepository) {}

  async execute(userId: string, page: number = 1, limit: number = 20, status?: string) {
    const skip = calcSkip(page, limit);
    const [data, total] = await Promise.all([
      this.orderRepository.findByUser(userId, status ?? null, skip, limit),
      this.orderRepository.countByUser(userId, status ?? null),
    ]);
    return { data, total, page, limit };
  }
}
