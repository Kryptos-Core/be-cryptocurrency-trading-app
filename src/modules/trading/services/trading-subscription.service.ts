import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ClientSubscription, CandleInterval, SubscriptionChannel } from '../interfaces/websocket.interface';
import { Server } from 'socket.io';

/**
 * Trading Subscription Service
 * Manages client subscriptions to trading pairs
 * Handles Socket.io room management for broadcasting
 */
@Injectable()
export class TradingSubscriptionService {
  private readonly logger = new Logger(TradingSubscriptionService.name);

  // Track all active subscriptions: clientId -> Set<pair_id>
  private clientSubscriptions = new Map<string, Set<number>>();

  // Track pairs: pair_id -> Set<clientId>
  private pairSubscribers = new Map<number, Set<string>>();

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
    userId: number,
    pairId: number,
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

    // Update subscription count
    this.subscriptionCounts.set(clientId, subscriptionCount + 1);

    this.logger.log(
      `✅ Client ${clientId} (user ${userId}) subscribed to pair ${pairId} (${channels.join(',')})`,
    );
  }

  /**
   * Unsubscribe client from a trading pair
   */
  async unsubscribe(
    clientId: string,
    pairId: number,
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

    // Update subscription count
    const count = this.subscriptionCounts.get(clientId) || 0;
    this.subscriptionCounts.set(clientId, Math.max(0, count - 1));

    this.logger.log(`✅ Client ${clientId} unsubscribed from pair ${pairId}`);
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

    this.logger.log(`✅ Client ${clientId} unsubscribed from all pairs`);
  }

  /**
   * Get all clients subscribed to a pair
   */
  getSubscribersForPair(pairId: number): Set<string> {
    return this.pairSubscribers.get(pairId) || new Set();
  }

  /**
   * Get all pairs a client is subscribed to
   */
  getSubscriptionsForClient(clientId: string): Set<number> {
    return this.clientSubscriptions.get(clientId) || new Set();
  }

  /**
   * Check if client is subscribed to a pair
   */
  isSubscribed(clientId: string, pairId: number): boolean {
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
    this.logger.log('🔄 All subscriptions reset');
  }
}
