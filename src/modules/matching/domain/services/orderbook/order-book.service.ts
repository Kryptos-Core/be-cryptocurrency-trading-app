import { Injectable } from '@nestjs/common';
import type { OrderBookOrder } from '../../../interfaces';
import { DEFAULT_SCALE, fromBaseUnits, toBaseUnits } from '../../../utils';
import { BuyQueueService } from './buy-queue.service';
import { SellQueueService } from './sell-queue.service';

export interface DepthLevel {
  price: string;
  amount: string;
  orderCount: number;
}

export interface DepthSnapshot {
  bids: DepthLevel[];
  asks: DepthLevel[];
  timestamp: string;
}

/**
 * Order Book (per-pair): buy side + sell side queues.
 * Queue Pattern: one buy queue + one sell queue per pair.
 */
@Injectable()
export class OrderBookService {
  private readonly books = new Map<string, { buy: BuyQueueService; sell: SellQueueService }>();

  /**
   * Tracks which pairs have been seeded from DB at least once.
   * Used by MatchingService to decide whether to do a full DB load or skip (incremental).
   */
  private readonly loadedPairs = new Set<string>();

  /** Normalize pair ids defensively so API / DB / queue inputs always map to one canonical in-memory order book key. */
  private normalizePairId(pairId: string): string {
    return (pairId ?? '').trim();
  }

  private getBook(pairId: string): {
    buy: BuyQueueService;
    sell: SellQueueService;
  } {
    const key = this.normalizePairId(pairId);
    let book = this.books.get(key);
    if (!book) {
      book = {
        buy: new BuyQueueService(),
        sell: new SellQueueService(),
      };
      this.books.set(key, book);
    }
    return book;
  }

  addOrder(order: OrderBookOrder): void {
    const book = this.getBook(order.pair_id);
    // Upsert semantics by order_id: remove any stale snapshot before adding the new one.
    book.buy.remove(order.order_id);
    book.sell.remove(order.order_id);
    if (order.side === 'BUY') book.buy.add(order);
    else book.sell.add(order);
  }

  removeOrder(pairId: string, orderId: string, side: 'BUY' | 'SELL'): boolean {
    const book = this.books.get(this.normalizePairId(pairId));
    if (!book) return false;
    return side === 'BUY' ? book.buy.remove(orderId) : book.sell.remove(orderId);
  }

  getBestBid(pairId: string): OrderBookOrder | null {
    return this.getBook(pairId).buy.peekBest();
  }

  getBestAsk(pairId: string): OrderBookOrder | null {
    return this.getBook(pairId).sell.peekBest();
  }

  popBestMaker(pairId: string, side: 'BUY' | 'SELL'): OrderBookOrder | null {
    const book = this.getBook(pairId);
    return side === 'BUY' ? book.buy.popBest() : book.sell.popBest();
  }

  peekBestMaker(pairId: string, side: 'BUY' | 'SELL'): OrderBookOrder | null {
    const book = this.getBook(pairId);
    return side === 'BUY' ? book.buy.peekBest() : book.sell.peekBest();
  }

  loadOrders(pairId: string, orders: OrderBookOrder[]): void {
    const key = this.normalizePairId(pairId);
    this.books.set(key, {
      buy: new BuyQueueService(),
      sell: new SellQueueService(),
    });
    // Reset loaded flag: full rebuild means the next incremental window starts fresh.
    this.loadedPairs.delete(key);
    for (const o of orders) {
      this.addOrder(o);
    }
  }

  /**
   * Returns true when this pair's book has been seeded from DB at least once.
   * MatchingService uses this to skip the full-rebuild DB query on subsequent matches.
   */
  isLoaded(pairId: string): boolean {
    return this.loadedPairs.has(this.normalizePairId(pairId));
  }

  /**
   * Mark a pair's book as seeded (called by MatchingService after the initial DB load).
   * Subsequent matches will use the in-memory book incrementally.
   */
  markLoaded(pairId: string): void {
    this.loadedPairs.add(this.normalizePairId(pairId));
  }

  getOrders(pairId: string, side: 'BUY' | 'SELL'): OrderBookOrder[] {
    const book = this.getBook(pairId);
    return side === 'BUY' ? book.buy.getAll() : book.sell.getAll();
  }

  size(pairId: string, side?: 'BUY' | 'SELL'): number {
    const book = this.getBook(pairId);
    if (side === 'BUY') return book.buy.size();
    if (side === 'SELL') return book.sell.size();
    return book.buy.size() + book.sell.size();
  }

  /**
   * Transparent Price Discovery: aggregate the in-memory order book into
   * depth levels (price → total amount + order count), limited to `depth` levels.
   * Uses BigInt arithmetic for deterministic aggregation (no floating-point error).
   * MARKET orders (null price) are excluded — only LIMIT resting orders are visible.
   */
  getSnapshot(pairId: string, depth: 5 | 10 | 20): DepthSnapshot {
    const book = this.getBook(pairId);
    const bids = this.aggregateLevels(book.buy.getAll(), depth);
    const asks = this.aggregateLevels(book.sell.getAll(), depth);
    return {
      bids,
      asks,
      timestamp: new Date().toISOString(),
    };
  }

  private aggregateLevels(orders: OrderBookOrder[], depth: number): DepthLevel[] {
    // Use a Map to aggregate by price. Orders from getAll() are already sorted.
    // We preserve the insertion order (sorted order) by iterating sequentially.
    const levelMap = new Map<string, { totalBu: bigint; count: number }>();

    for (const o of orders) {
      if (o.price === null) continue;
      const key = o.price;
      const existing = levelMap.get(key);
      const amountBu = toBaseUnits(o.remaining, DEFAULT_SCALE);
      if (existing) {
        existing.totalBu += amountBu;
        existing.count += 1;
      } else {
        levelMap.set(key, { totalBu: amountBu, count: 1 });
      }
    }

    const levels: DepthLevel[] = [];
    for (const [price, { totalBu, count }] of levelMap) {
      if (levels.length >= depth) break;
      levels.push({
        price,
        amount: fromBaseUnits(totalBu, DEFAULT_SCALE),
        orderCount: count,
      });
    }
    return levels;
  }
}
