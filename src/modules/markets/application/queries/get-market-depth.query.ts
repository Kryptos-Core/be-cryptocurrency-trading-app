import { Injectable } from '@nestjs/common';
import type { DepthSnapshot } from '@/modules/matching/orderbook/order-book.service';
import { MarketsService } from '../../markets.service';

/**
 * GetMarketDepthQuery — read-only query for order book, recent trades, and depth snapshot.
 * Delegates to MarketsService; use this from controllers instead of calling the service directly.
 */
@Injectable()
export class GetMarketDepthQuery {
  constructor(private readonly marketsService: MarketsService) {}

  async getOrderBook(pairId: string, limit: number = 20): Promise<Record<string, unknown>> {
    return this.marketsService.getOrderBook(pairId, limit);
  }

  async getOrderBookBySymbol(symbol: string, limit: number = 20): Promise<Record<string, unknown>> {
    return this.marketsService.getOrderBookBySymbol(symbol, limit);
  }

  async getRecentTrades(pairId: string, limit: number = 50): Promise<unknown[]> {
    return this.marketsService.getRecentTrades(pairId, limit);
  }

  async getRecentTradesBySymbol(symbol: string, limit: number = 50): Promise<unknown[]> {
    return this.marketsService.getRecentTradesBySymbol(symbol, limit);
  }

  async getDepthSnapshot(pairId: string, depth: number): Promise<DepthSnapshot> {
    return this.marketsService.getDepthSnapshot(pairId, depth);
  }

  async getDepthSnapshotBySymbol(symbol: string, depth: number): Promise<DepthSnapshot> {
    return this.marketsService.getDepthSnapshotBySymbol(symbol, depth);
  }
}
