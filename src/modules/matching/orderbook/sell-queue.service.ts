import { Injectable } from '@nestjs/common';
import { IOrderQueue, OrderBookOrder } from '../interfaces';

/**
 * Sell Queue (Queue Pattern)
 * Price-time priority: best ask first (price ASC), then oldest (created_at ASC).
 */
@Injectable()
export class SellQueueService implements IOrderQueue {
  private readonly orders: OrderBookOrder[] = [];

  add(order: OrderBookOrder): void {
    if (order.side !== 'SELL' || parseFloat(order.remaining) <= 0) return;
    this.orders.push(order);
    this.sort();
  }

  remove(orderId: number): boolean {
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
      const priceA = a.price ? parseFloat(a.price) : Number.MAX_SAFE_INTEGER;
      const priceB = b.price ? parseFloat(b.price) : Number.MAX_SAFE_INTEGER;
      if (priceA !== priceB) return priceA - priceB; // ASC
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime(); // ASC time
    });
  }
}
