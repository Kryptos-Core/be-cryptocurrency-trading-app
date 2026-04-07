import { Injectable } from '@nestjs/common';
import { IOrderQueue, OrderBookOrder } from '../interfaces';
import { toBaseUnits, DEFAULT_SCALE } from '../utils';

/**
 * Sell Queue (Queue Pattern)
 * Price-time priority: best ask first (price ASC), then oldest (created_at ASC).
 * Uses BigInt comparison for deterministic precision on DECIMAL(36,18) prices.
 */
@Injectable()
export class SellQueueService implements IOrderQueue {
  private readonly orders: OrderBookOrder[] = [];

  add(order: OrderBookOrder): void {
    if (order.side !== 'SELL' || toBaseUnits(order.remaining, DEFAULT_SCALE) <= 0n) return;
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
    const MAX_PRICE = toBaseUnits('999999999999999999.999999999999999999', DEFAULT_SCALE);
    this.orders.sort((a, b) => {
      const priceA = a.price ? toBaseUnits(a.price, DEFAULT_SCALE) : MAX_PRICE;
      const priceB = b.price ? toBaseUnits(b.price, DEFAULT_SCALE) : MAX_PRICE;
      if (priceA !== priceB) return priceA > priceB ? 1 : -1; // ASC
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime(); // ASC time
    });
  }
}
