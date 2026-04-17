import type { IOrderQueue, OrderBookOrder } from '../../../interfaces';
import { DEFAULT_SCALE, toBaseUnits } from '../../../utils';

type QueueSide = 'BUY' | 'SELL';
type SortDirection = 'ASC' | 'DESC';

export class OrderQueueService implements IOrderQueue {
  private readonly orders: OrderBookOrder[] = [];

  constructor(
    private readonly side: QueueSide,
    private readonly sortDirection: SortDirection,
    private readonly fallbackPrice: bigint,
  ) {}

  add(order: OrderBookOrder): void {
    if (order.side !== this.side || toBaseUnits(order.remaining, DEFAULT_SCALE) <= 0n) return;
    this.orders.push(order);
    this.sort();
  }

  remove(orderId: string): boolean {
    const idx = this.orders.findIndex((o) => o.order_id === orderId);
    if (idx === -1) return false;
    this.orders.splice(idx, 1);
    return true;
  }

  peekBest(): OrderBookOrder | null {
    return this.orders.length > 0 ? this.orders[0] : null;
  }

  popBest(): OrderBookOrder | null {
    return this.orders.length > 0 ? this.orders.shift()! : null;
  }

  size(): number {
    return this.orders.length;
  }

  getAll(): OrderBookOrder[] {
    return [...this.orders];
  }

  private sort(): void {
    this.orders.sort((a, b) => {
      const priceA = a.price ? toBaseUnits(a.price, DEFAULT_SCALE) : this.fallbackPrice;
      const priceB = b.price ? toBaseUnits(b.price, DEFAULT_SCALE) : this.fallbackPrice;
      if (priceA !== priceB) {
        if (this.sortDirection === 'ASC') {
          return priceA > priceB ? 1 : -1;
        }
        return priceB > priceA ? 1 : -1;
      }
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
  }
}
