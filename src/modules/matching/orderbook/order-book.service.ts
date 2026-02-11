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
    number,
    { buy: BuyQueueService; sell: SellQueueService }
  >();

  private getBook(pairId: number): {
    buy: BuyQueueService;
    sell: SellQueueService;
  } {
    let book = this.books.get(pairId);
    if (!book) {
      book = {
        buy: new BuyQueueService(),
        sell: new SellQueueService(),
      };
      this.books.set(pairId, book);
    }
    return book;
  }

  addOrder(order: OrderBookOrder): void {
    const book = this.getBook(order.pair_id);
    if (order.side === 'BUY') book.buy.add(order);
    else book.sell.add(order);
  }

  removeOrder(pairId: number, orderId: number, side: 'BUY' | 'SELL'): boolean {
    const book = this.books.get(pairId);
    if (!book) return false;
    return side === 'BUY' ? book.buy.remove(orderId) : book.sell.remove(orderId);
  }

  getBestBid(pairId: number): OrderBookOrder | null {
    return this.getBook(pairId).buy.peekBest();
  }

  getBestAsk(pairId: number): OrderBookOrder | null {
    return this.getBook(pairId).sell.peekBest();
  }

  popBestMaker(pairId: number, side: 'BUY' | 'SELL'): OrderBookOrder | null {
    const book = this.getBook(pairId);
    return side === 'BUY' ? book.buy.popBest() : book.sell.popBest();
  }

  peekBestMaker(pairId: number, side: 'BUY' | 'SELL'): OrderBookOrder | null {
    const book = this.getBook(pairId);
    return side === 'BUY' ? book.buy.peekBest() : book.sell.peekBest();
  }

  loadOrders(pairId: number, orders: OrderBookOrder[]): void {
    this.books.set(pairId, {
      buy: new BuyQueueService(),
      sell: new SellQueueService(),
    });
    orders.forEach((o) => this.addOrder(o));
  }

  size(pairId: number, side?: 'BUY' | 'SELL'): number {
    const book = this.getBook(pairId);
    if (side === 'BUY') return book.buy.size();
    if (side === 'SELL') return book.sell.size();
    return book.buy.size() + book.sell.size();
  }
}
