import { Inject, Injectable } from '@nestjs/common';
import { ORDER_REPOSITORY, type OrderRepositoryPort, type OrderBookLevel } from '@/modules/orders/domain/ports';

@Injectable()
export class GetOrderBookQuery {
  constructor(
    @Inject(ORDER_REPOSITORY)
    private readonly orderRepository: OrderRepositoryPort,
  ) {}

  execute(pairId: string, side: 'BUY' | 'SELL', limit: number = 50): Promise<OrderBookLevel[]> {
    return this.orderRepository.getOrderBook(pairId, side, limit);
  }
}
