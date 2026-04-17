import { DEFAULT_SCALE, fromBaseUnits, toBaseUnits } from '../../utils';
import type { EventStore, OrderPlacedEvent, TradeExecutedEvent } from './event-store';

export interface ProjectedOrder {
  readonly orderId: string;
  readonly userId: string;
  readonly side: 'BUY' | 'SELL';
  readonly price: string;
  readonly amount: string;
  readonly remaining: string;
  readonly orderType: 'LIMIT' | 'MARKET';
  readonly timeInForce: string;
}

export interface ProjectedOrderBook {
  readonly pairId: string;
  readonly bids: ProjectedOrder[];
  readonly asks: ProjectedOrder[];
  readonly sequence: number;
}

export class OrderBookProjection {
  constructor(private readonly store: EventStore) {}

  build(pairId: string): ProjectedOrderBook {
    return this.buildAt(pairId, this.store.getLastSequence(pairId));
  }

  buildAt(pairId: string, sequence: number): ProjectedOrderBook {
    const orders = new Map<string, ProjectedOrder>();
    const events = this.store.getStoredEvents(pairId, sequence);

    for (const wrapper of events) {
      const event = wrapper.event;
      switch (event.type) {
        case 'OrderPlaced':
          this.applyPlaced(orders, event);
          break;
        case 'TradeExecuted':
          this.applyTrade(orders, event);
          break;
        case 'OrderCancelled':
          orders.delete(event.orderId);
          break;
      }
    }

    const values = [...orders.values()].filter((o) => o.remaining !== '0');
    return {
      pairId,
      bids: values.filter((o) => o.side === 'BUY').sort((a, b) => this.compareOrders(a, b, 'BUY')),
      asks: values
        .filter((o) => o.side === 'SELL')
        .sort((a, b) => this.compareOrders(a, b, 'SELL')),
      sequence,
    };
  }

  private applyPlaced(orders: Map<string, ProjectedOrder>, event: OrderPlacedEvent): void {
    orders.set(event.orderId, {
      orderId: event.orderId,
      userId: event.userId,
      side: event.side,
      price: event.price,
      amount: event.amount,
      remaining: event.amount,
      orderType: event.orderType,
      timeInForce: event.timeInForce,
    });
  }

  private applyTrade(orders: Map<string, ProjectedOrder>, event: TradeExecutedEvent): void {
    const maker = orders.get(event.makerOrderId);
    if (!maker) return;

    const makerRemaining = this.subtract(maker.remaining, event.amount);
    if (makerRemaining === '0') {
      orders.delete(event.makerOrderId);
      return;
    }

    orders.set(event.makerOrderId, { ...maker, remaining: makerRemaining });
  }

  private subtract(left: string, right: string): string {
    return fromBaseUnits(
      toBaseUnits(left, DEFAULT_SCALE) - toBaseUnits(right, DEFAULT_SCALE),
      DEFAULT_SCALE,
    );
  }

  private compareOrders(a: ProjectedOrder, b: ProjectedOrder, side: 'BUY' | 'SELL'): number {
    const pa = toBaseUnits(a.price, DEFAULT_SCALE);
    const pb = toBaseUnits(b.price, DEFAULT_SCALE);
    if (pa === pb) return 0;
    if (side === 'BUY') return pa > pb ? -1 : 1;
    return pa < pb ? -1 : 1;
  }
}
