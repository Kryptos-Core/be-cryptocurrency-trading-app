import { BadRequestException, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  type CandleInterval,
  MARKET_EVENTS,
  type OhlcSubscriptionEvent,
  type SubscriptionChannel,
} from '../interfaces/websocket.interface';

/** Per-client per-pair subscription detail (for OHLC chart symbol resolution). */
interface PairSubscriptionDetail {
  channels: SubscriptionChannel[];
  interval?: CandleInterval;
  symbol?: string;
}

/**
 * Trading Subscription Service
 * Manages client subscriptions to trading pairs
 * Handles Socket.io room management for broadcasting
 */
@Injectable()
export class TradingSubscriptionService {
  // Track all active subscriptions: clientId -> Set<pair_id>
  private clientSubscriptions = new Map<string, Set<string>>();

  // Track pairs: pair_id -> Set<clientId>
  private pairSubscribers = new Map<string, Set<string>>();

  // Per-client per-pair detail (channels + interval) for OHLC/kline stream
  private clientPairDetails = new Map<string, Map<string, PairSubscriptionDetail>>();

  // Rate limiting: clientId -> subscription count
  private subscriptionCounts = new Map<string, number>();

  // Configuration
  private readonly MAX_SUBSCRIPTIONS_PER_CLIENT = 20;
  private readonly MAX_CLIENTS_PER_PAIR = 10000;

  /** pairId:interval -> count of active ohlc subscribers (for demand-based kline subscription). */
  private ohlcSubscriberCount = new Map<string, number>();

  constructor(private readonly eventEmitter: EventEmitter2) {}

  /**
   * Subscribe client to a trading pair
   */
  async subscribe(
    clientId: string,
    _userId: string,
    pairId: string,
    channels: SubscriptionChannel[],
    interval?: CandleInterval,
    symbol?: string,
  ): Promise<void> {
    // Check rate limit
    const subscriptionCount = this.subscriptionCounts.get(clientId) || 0;
    if (subscriptionCount >= this.MAX_SUBSCRIPTIONS_PER_CLIENT) {
      throw new BadRequestException(
        `Too many subscriptions. Maximum ${this.MAX_SUBSCRIPTIONS_PER_CLIENT} allowed`,
      );
    }

    // Check pair capacity
    const pairSubs = this.pairSubscribers.get(pairId) || new Set();
    if (pairSubs.size >= this.MAX_CLIENTS_PER_PAIR) {
      throw new BadRequestException(`Pair ${pairId} is at maximum capacity`);
    }

    // Add to subscription tracking
    if (!this.clientSubscriptions.has(clientId)) {
      this.clientSubscriptions.set(clientId, new Set());
    }
    this.clientSubscriptions.get(clientId)?.add(pairId);

    if (!this.pairSubscribers.has(pairId)) {
      this.pairSubscribers.set(pairId, new Set());
    }
    this.pairSubscribers.get(pairId)?.add(clientId);

    if (!this.clientPairDetails.has(clientId)) {
      this.clientPairDetails.set(clientId, new Map());
    }
    this.clientPairDetails.get(clientId)?.set(pairId, { channels, interval, symbol });

    // Update subscription count
    this.subscriptionCounts.set(clientId, subscriptionCount + 1);

    // Emit demand event when first client subscribes to ohlc for this pair+interval
    if (channels.includes('ohlc') && interval && symbol) {
      const key = `${pairId}:${interval}`;
      const prevCount = this.ohlcSubscriberCount.get(key) ?? 0;
      this.ohlcSubscriberCount.set(key, prevCount + 1);
      if (prevCount === 0) {
        const event: OhlcSubscriptionEvent = { symbol, pair_id: pairId, interval };
        this.eventEmitter.emit(MARKET_EVENTS.OHLC_SUBSCRIPTION_ADDED, event);
      }
    }
  }

  /**
   * Unsubscribe client from a trading pair
   */
  async unsubscribe(
    clientId: string,
    pairId: string,
    channels: SubscriptionChannel[],
  ): Promise<void> {
    const clientSubs = this.clientSubscriptions.get(clientId);
    if (!clientSubs?.has(pairId)) {
      throw new BadRequestException(`Client not subscribed to pair ${pairId}`);
    }

    const detail = this.clientPairDetails.get(clientId)?.get(pairId);

    // Remove subscription
    clientSubs.delete(pairId);

    const pairSubs = this.pairSubscribers.get(pairId);
    if (pairSubs) {
      pairSubs.delete(clientId);
    }

    this.clientPairDetails.get(clientId)?.delete(pairId);

    // Update subscription count
    const count = this.subscriptionCounts.get(clientId) || 0;
    this.subscriptionCounts.set(clientId, Math.max(0, count - 1));

    // Emit demand removal event when last client unsubscribes from ohlc for this pair+interval
    if (channels.includes('ohlc') && detail?.interval && detail?.symbol) {
      const key = `${pairId}:${detail.interval}`;
      const prevCount = this.ohlcSubscriberCount.get(key) ?? 0;
      const newCount = Math.max(0, prevCount - 1);
      this.ohlcSubscriberCount.set(key, newCount);
      if (newCount === 0) {
        this.ohlcSubscriberCount.delete(key);
        const event: OhlcSubscriptionEvent = {
          symbol: detail.symbol,
          pair_id: pairId,
          interval: detail.interval,
        };
        this.eventEmitter.emit(MARKET_EVENTS.OHLC_SUBSCRIPTION_REMOVED, event);
      }
    }
  }

  /**
   * Unsubscribe client from all pairs, emitting ohlc removal events for last subscriber.
   */
  async unsubscribeClientFromAll(clientId: string): Promise<void> {
    const pairs = this.clientSubscriptions.get(clientId);
    if (!pairs) return;

    const detailMap = this.clientPairDetails.get(clientId);

    for (const pairId of pairs) {
      const pairSubs = this.pairSubscribers.get(pairId);
      if (pairSubs) pairSubs.delete(clientId);

      const detail = detailMap?.get(pairId);
      if (detail?.channels.includes('ohlc') && detail.interval && detail.symbol) {
        const key = `${pairId}:${detail.interval}`;
        const prevCount = this.ohlcSubscriberCount.get(key) ?? 0;
        const newCount = Math.max(0, prevCount - 1);
        if (newCount === 0) {
          this.ohlcSubscriberCount.delete(key);
          const event: OhlcSubscriptionEvent = {
            symbol: detail.symbol,
            pair_id: pairId,
            interval: detail.interval,
          };
          this.eventEmitter.emit(MARKET_EVENTS.OHLC_SUBSCRIPTION_REMOVED, event);
        } else {
          this.ohlcSubscriberCount.set(key, newCount);
        }
      }
    }

    this.clientSubscriptions.delete(clientId);
    this.subscriptionCounts.delete(clientId);
    this.clientPairDetails.delete(clientId);
  }

  /**
   * Get up to 2 pair IDs that have at least one OHLC subscriber (for Binance kline stream).
   */
  getPairIdsWithOhlcSubscription(max = 2): string[] {
    const set = new Set<string>();
    for (const pairMap of this.clientPairDetails.values()) {
      for (const [pairId, detail] of pairMap) {
        if (detail.channels?.includes('ohlc')) {
          set.add(pairId);
          if (set.size >= max) return Array.from(set);
        }
      }
    }
    return Array.from(set);
  }

  /**
   * Get all clients subscribed to a pair
   */
  getSubscribersForPair(pairId: string): Set<string> {
    return this.pairSubscribers.get(pairId) || new Set();
  }

  /**
   * Get all pair IDs that have at least one subscriber (for on-demand price feed).
   */
  getSubscribedPairIds(): string[] {
    return Array.from(this.pairSubscribers.keys());
  }

  /**
   * Get all pairs a client is subscribed to
   */
  getSubscriptionsForClient(clientId: string): Set<string> {
    return this.clientSubscriptions.get(clientId) ?? new Set();
  }

  /**
   * Check if client is subscribed to a pair
   */
  isSubscribed(clientId: string, pairId: string): boolean {
    return this.clientSubscriptions.get(clientId)?.has(pairId) ?? false;
  }

  /**
   * Get subscription statistics
   */
  getStats() {
    return {
      total_clients: this.clientSubscriptions.size,
      total_pairs: this.pairSubscribers.size,
      total_subscriptions: Array.from(this.clientSubscriptions.values()).reduce(
        (sum, pairs) => sum + pairs.size,
        0,
      ),
      pairs: Array.from(this.pairSubscribers.entries()).map(([pairId, clients]) => ({
        pair_id: pairId,
        subscribers: clients.size,
      })),
    };
  }

  /**
   * Reset all subscriptions (for testing/cleanup)
   */
  reset() {
    this.clientSubscriptions.clear();
    this.pairSubscribers.clear();
    this.subscriptionCounts.clear();
    this.clientPairDetails.clear();
    this.ohlcSubscriberCount.clear();
  }
}
