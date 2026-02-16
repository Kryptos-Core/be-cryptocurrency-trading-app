import { Injectable } from '@nestjs/common';
import { IOrderQueue, OrderBookOrder } from '../interfaces';

/**
 * Buy Queue (Queue Pattern)
 * Price-time priority: best bid first (price DESC), then oldest (created_at ASC).
 */
@Injectable()
export class BuyQueueService implements IOrderQueue {
  private readonly orders: OrderBookOrder[] = [];

  add(order: OrderBookOrder): void {
    if (order.side !== 'BUY' || parseFloat(order.remaining) <= 0) return;
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
      const priceA = a.price ? parseFloat(a.price) : 0;
      const priceB = b.price ? parseFloat(b.price) : 0;
      if (priceB !== priceA) return priceB - priceA; // DESC
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime(); // ASC time
    });
  }
}
