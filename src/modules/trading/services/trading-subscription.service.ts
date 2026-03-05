import { Injectable, BadRequestException } from '@nestjs/common';
import { ClientSubscription, CandleInterval, SubscriptionChannel } from '../interfaces/websocket.interface';
import { Server } from 'socket.io';

/** Per-client per-pair subscription detail (for OHLC chart symbol resolution). */
interface PairSubscriptionDetail {
  channels: SubscriptionChannel[];
  interval?: CandleInterval;
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

  /**
   * Subscribe client to a trading pair
   */
  async subscribe(
    clientId: string,
    userId: string,
    pairId: string,
    channels: SubscriptionChannel[],
    interval?: CandleInterval,
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
    this.clientSubscriptions.get(clientId)!.add(pairId);

    if (!this.pairSubscribers.has(pairId)) {
      this.pairSubscribers.set(pairId, new Set());
    }
    this.pairSubscribers.get(pairId)!.add(clientId);

    if (!this.clientPairDetails.has(clientId)) {
      this.clientPairDetails.set(clientId, new Map());
    }
    this.clientPairDetails.get(clientId)!.set(pairId, { channels, interval });

    // Update subscription count
    this.subscriptionCounts.set(clientId, subscriptionCount + 1);
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
    if (!clientSubs || !clientSubs.has(pairId)) {
      throw new BadRequestException(`Client not subscribed to pair ${pairId}`);
    }

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
  }

  /**
   * Unsubscribe client from all pairs
   */
  async unsubscribeClientFromAll(clientId: string): Promise<void> {
    const pairs = this.clientSubscriptions.get(clientId);
    if (!pairs) return;

    for (const pairId of pairs) {
      const pairSubs = this.pairSubscribers.get(pairId);
      if (pairSubs) {
        pairSubs.delete(clientId);
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
  }
}
