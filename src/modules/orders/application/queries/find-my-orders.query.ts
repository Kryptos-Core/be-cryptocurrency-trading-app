import { Inject, Injectable } from '@nestjs/common';
import { calcSkip } from '@/common/utils/pagination.util';
import { ORDER_REPOSITORY, type OrderRepositoryPort } from '@/modules/orders/domain/ports';

@Injectable()
export class FindMyOrdersQuery {
  constructor(
    @Inject(ORDER_REPOSITORY)
    private readonly orderRepository: OrderRepositoryPort,
  ) {}

  async execute(userId: string, page: number = 1, limit: number = 20, status?: string) {
    const skip = calcSkip(page, limit);
    const [data, total] = await Promise.all([
      this.orderRepository.findByUser(userId, status ?? null, skip, limit),
      this.orderRepository.countByUser(userId, status ?? null),
    ]);
    return { data, total, page, limit };
  }
}
