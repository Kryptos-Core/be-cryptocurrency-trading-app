/**
 * Order Book Projection — Rebuilds order book state from events.
 *
 * Pure function over the event stream: no side effects, no external dependencies.
 * Supports time-travel: buildAt(pairId, sequence) replays only up to the given
 * sequence number, enabling point-in-time book snapshots.
 *
 * Uses BigInt base units internally for deterministic arithmetic.
 */

import {
  EventStore,
  OrderBookEvent,
  OrderPlacedEvent,
  TradeExecutedEvent,
} from './event-store';
import { toBaseUnits, fromBaseUnits, DEFAULT_SCALE } from '../utils';

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

  /**
   * Replay events up to `upToSequence` (or all events if omitted) and return
   * the projected order book state.
   */
  buildAt(pairId: string, upToSequence?: number): ProjectedOrderBook {
    const storedEvents = this.store.getStoredEvents(pairId, upToSequence);
    if (storedEvents.length === 0) {
      return { pairId, bids: [], asks: [], sequence: 0 };
    }

    // Mutable working state: orderId → { side, price, amountBu, remainingBu, ... }
    const orders = new Map<
      string,
      {
        orderId: string;
        userId: string;
        side: 'BUY' | 'SELL';
        price: string;
        amountBu: bigint;
        remainingBu: bigint;
        orderType: 'LIMIT' | 'MARKET';
        timeInForce: string;
        cancelled: boolean;
      }
    >();

    let lastSeq = 0;

    for (const { sequence, event } of storedEvents) {
      lastSeq = sequence;
      this.applyEvent(orders, event);
    }

    // Build sorted output
    const bids: ProjectedOrder[] = [];
    const asks: ProjectedOrder[] = [];

    for (const o of orders.values()) {
      if (o.cancelled || o.remainingBu <= 0n) continue;
      const projected: ProjectedOrder = {
        orderId: o.orderId,
        userId: o.userId,
        side: o.side,
        price: o.price,
        amount: fromBaseUnits(o.amountBu, DEFAULT_SCALE),
        remaining: fromBaseUnits(o.remainingBu, DEFAULT_SCALE),
        orderType: o.orderType,
        timeInForce: o.timeInForce,
      };
      if (o.side === 'BUY') bids.push(projected);
      else asks.push(projected);
    }

    // Sort bids price DESC, asks price ASC (BigInt comparison)
    bids.sort((a, b) => {
      const pa = toBaseUnits(a.price, DEFAULT_SCALE);
      const pb = toBaseUnits(b.price, DEFAULT_SCALE);
      if (pb !== pa) return pb > pa ? 1 : -1;
      return 0;
    });
    asks.sort((a, b) => {
      const pa = toBaseUnits(a.price, DEFAULT_SCALE);
      const pb = toBaseUnits(b.price, DEFAULT_SCALE);
      if (pa !== pb) return pa > pb ? 1 : -1;
      return 0;
    });

    return { pairId, bids, asks, sequence: lastSeq };
  }

  private applyEvent(
    orders: Map<string, any>,
    event: OrderBookEvent,
  ): void {
    switch (event.type) {
      case 'OrderPlaced':
        this.applyOrderPlaced(orders, event);
        break;
      case 'OrderCancelled':
        this.applyOrderCancelled(orders, event);
        break;
      case 'TradeExecuted':
        this.applyTradeExecuted(orders, event);
        break;
    }
  }

  private applyOrderPlaced(
    orders: Map<string, any>,
    event: OrderPlacedEvent,
  ): void {
    const amountBu = toBaseUnits(event.amount, DEFAULT_SCALE);
    orders.set(event.orderId, {
      orderId: event.orderId,
      userId: event.userId,
      side: event.side,
      price: event.price,
      amountBu,
      remainingBu: amountBu,
      orderType: event.orderType,
      timeInForce: event.timeInForce,
      cancelled: false,
    });
  }

  private applyOrderCancelled(
    orders: Map<string, any>,
    event: { orderId: string },
  ): void {
    const order = orders.get(event.orderId);
    if (order) {
      order.cancelled = true;
    }
  }

  private applyTradeExecuted(
    orders: Map<string, any>,
    event: TradeExecutedEvent,
  ): void {
    const fillBu = toBaseUnits(event.amount, DEFAULT_SCALE);

    const maker = orders.get(event.makerOrderId);
    if (maker) {
      maker.remainingBu -= fillBu;
      if (maker.remainingBu < 0n) maker.remainingBu = 0n;
    }

    const taker = orders.get(event.takerOrderId);
    if (taker) {
      taker.remainingBu -= fillBu;
      if (taker.remainingBu < 0n) taker.remainingBu = 0n;
    }
  }
}
