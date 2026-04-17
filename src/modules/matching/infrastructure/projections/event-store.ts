/**
 * Event-Sourced Order Book — Immutable Domain Events
 *
 * Three event types capture every order book mutation:
 *   - OrderPlaced: new resting order added
 *   - OrderCancelled: order removed (user or system)
 *   - TradeExecuted: fill between maker and taker
 *
 * Events are append-only and immutable. The EventStore assigns a monotonically
 * increasing sequence number per append. Projections replay events to rebuild
 * order book state at any point in history.
 */

import { DomainEvent, DomainEventDispatcher } from '@/common/domain-events';

export class MatchingEventStoredEvent extends DomainEvent {
  public readonly eventType = 'MatchingEventStored' as const;

  constructor(
    public readonly sequence: number,
    public readonly payload: OrderBookEvent,
  ) {
    super();
  }
}

// ── Event Types ─────────────────────────────────────────────────────────────

export interface OrderPlacedEvent {
  readonly type: 'OrderPlaced';
  readonly timestamp: Date;
  readonly pairId: string;
  readonly orderId: string;
  readonly userId: string;
  readonly side: 'BUY' | 'SELL';
  readonly orderType: 'LIMIT' | 'MARKET';
  readonly price: string;
  readonly amount: string;
  readonly timeInForce: string;
}

export interface OrderCancelledEvent {
  readonly type: 'OrderCancelled';
  readonly timestamp: Date;
  readonly pairId: string;
  readonly orderId: string;
  readonly reason: string;
}

export interface TradeExecutedEvent {
  readonly type: 'TradeExecuted';
  readonly timestamp: Date;
  readonly pairId: string;
  readonly tradeId: string;
  readonly makerOrderId: string;
  readonly takerOrderId: string;
  readonly price: string;
  readonly amount: string;
  readonly makerFee: string;
  readonly takerFee: string;
}

export type OrderBookEvent = OrderPlacedEvent | OrderCancelledEvent | TradeExecutedEvent;

// ── Stored Event (with sequence) ────────────────────────────────────────────

export interface StoredEvent<E extends OrderBookEvent = OrderBookEvent> {
  readonly sequence: number;
  readonly event: E;
}

// ── Event Store ─────────────────────────────────────────────────────────────

/**
 * In-memory, append-only event store.
 * Events are partitioned by pairId for efficient per-pair replay.
 * Thread-safe within a single Node process (no async writes).
 */
export class EventStore {
  private readonly streams = new Map<string, StoredEvent[]>();
  private globalSequence = 0;

  constructor(private readonly domainEventDispatcher?: DomainEventDispatcher) {}

  /**
   * Append an event. Returns the assigned sequence number.
   * The event object is frozen to enforce immutability.
   */
  append(event: OrderBookEvent): number {
    this.globalSequence += 1;
    const seq = this.globalSequence;
    const stored: StoredEvent = { sequence: seq, event: Object.freeze({ ...event }) };

    const key = event.pairId;
    let stream = this.streams.get(key);
    if (!stream) {
      stream = [];
      this.streams.set(key, stream);
    }
    stream.push(stored);

    if (this.domainEventDispatcher) {
      this.domainEventDispatcher
        .publish(new MatchingEventStoredEvent(seq, stored.event))
        .catch(() => undefined);
    }

    return seq;
  }

  /**
   * Get events for a pair, optionally after a given sequence number.
   * Returns a shallow copy of the array to prevent external mutation.
   */
  getEvents(pairId: string, afterSequence?: number): OrderBookEvent[] {
    const stream = this.streams.get(pairId);
    if (!stream) return [];

    const filtered =
      afterSequence != null ? stream.filter((s) => s.sequence > afterSequence) : stream;

    return filtered.map((s) => s.event);
  }

  /**
   * Get stored events (with sequence numbers) for a pair, optionally up to a max sequence.
   */
  getStoredEvents(pairId: string, upToSequence?: number): StoredEvent[] {
    const stream = this.streams.get(pairId);
    if (!stream) return [];

    if (upToSequence != null) {
      return stream.filter((s) => s.sequence <= upToSequence).map((s) => ({ ...s }));
    }
    return stream.map((s) => ({ ...s }));
  }

  /**
   * Returns the highest sequence number for a pair (0 if no events).
   */
  getLastSequence(pairId: string): number {
    const stream = this.streams.get(pairId);
    if (!stream || stream.length === 0) return 0;
    return stream[stream.length - 1].sequence;
  }
}
