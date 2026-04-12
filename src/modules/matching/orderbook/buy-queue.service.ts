import { Injectable } from '@nestjs/common';
import type { IOrderQueue, OrderBookOrder } from '../interfaces';
import { DEFAULT_SCALE, toBaseUnits } from '../utils';

/**
 * Buy Queue (Queue Pattern)
 * Price-time priority: best bid first (price DESC), then oldest (created_at ASC).
 * Uses BigInt comparison for deterministic precision on DECIMAL(36,18) prices.
 */
@Injectable()
export class BuyQueueService implements IOrderQueue {
  private readonly orders: OrderBookOrder[] = [];

  add(order: OrderBookOrder): void {
    if (order.side !== 'BUY' || toBaseUnits(order.remaining, DEFAULT_SCALE) <= 0n) return;
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
      const priceA = a.price ? toBaseUnits(a.price, DEFAULT_SCALE) : 0n;
      const priceB = b.price ? toBaseUnits(b.price, DEFAULT_SCALE) : 0n;
      if (priceB !== priceA) return priceB > priceA ? 1 : -1; // DESC
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime(); // ASC time
    });
  }
}
