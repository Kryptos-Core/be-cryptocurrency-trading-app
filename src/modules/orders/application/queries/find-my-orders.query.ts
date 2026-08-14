import { Inject, Injectable } from '@nestjs/common';
import { CacheService } from '@/common/services';
import { calcSkip } from '@/common/utils/pagination.util';
import { ORDER_REPOSITORY, type OrderRepositoryPort } from '@/modules/orders/domain/ports';

@Injectable()
export class FindMyOrdersQuery {
  /**
   * Cache-Aside TTL for the user's orders list (seconds).
   * 10s absorbs tab taps while realtime updates land via
   * the order:update / trade:filled WS events.
   */
  private static readonly CACHE_TTL_SEC = 10;

  constructor(
    @Inject(ORDER_REPOSITORY)
    private readonly orderRepository: OrderRepositoryPort,
    private readonly cacheService: CacheService,
  ) {}

  async execute(userId: string, page: number = 1, limit: number = 20, status?: string) {
    const cacheKey = `orders:user:${userId}:status:${status ?? 'all'}:p${page}:l${limit}`;

    return this.cacheService.getOrSet(
      cacheKey,
      async () => {
        const skip = calcSkip(page, limit);
        const [data, total] = await Promise.all([
          this.orderRepository.findByUser(userId, status ?? null, skip, limit),
          this.orderRepository.countByUser(userId, status ?? null),
        ]);
        return { data, total, page, limit };
      },
      FindMyOrdersQuery.CACHE_TTL_SEC,
    );
  }
}
