import { Injectable } from '@nestjs/common';
import { BuyQueueService } from './buy-queue.service';
import { SellQueueService } from './sell-queue.service';
import { OrderBookOrder } from '../interfaces';

/**
 * Order Book (per-pair): buy side + sell side queues.
 * Queue Pattern: one buy queue + one sell queue per pair.
 */
@Injectable()
export class OrderBookService {
  private readonly books = new Map<
    string,
    { buy: BuyQueueService; sell: SellQueueService }
  >();

  /**
   * Tracks which pairs have been seeded from DB at least once.
   * Used by MatchingService to decide whether to do a full DB load or skip (incremental).
   */
  private readonly loadedPairs = new Set<string>();

  /** MySQL CHAR(n) pads with spaces; callers may pass an untrimmed API id — one canonical key per pair. */
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
    orders.forEach((o) => this.addOrder(o));
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

  size(pairId: string, side?: 'BUY' | 'SELL'): number {
    const book = this.getBook(pairId);
    if (side === 'BUY') return book.buy.size();
    if (side === 'SELL') return book.sell.size();
    return book.buy.size() + book.sell.size();
  }
}
