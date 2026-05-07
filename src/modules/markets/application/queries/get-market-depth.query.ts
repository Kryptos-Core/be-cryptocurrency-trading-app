import { Injectable } from '@nestjs/common';
import type { DepthSnapshot } from '@/modules/matching/domain/services/orderbook/order-book.service';
import type { MarketOrderBookResponse, MarketRecentTradeResponse } from '../../markets.service';
import { MarketsService } from '../../markets.service';

@Injectable()
export class GetMarketDepthQuery {
  constructor(private readonly marketsService: MarketsService) {}

  async getOrderBook(pairIdOrSymbol: string, limit?: number): Promise<MarketOrderBookResponse> {
    return this.marketsService.getOrderBook(pairIdOrSymbol, limit);
  }

  async getOrderBookBySymbol(symbol: string, limit?: number): Promise<MarketOrderBookResponse> {
    return this.marketsService.getOrderBookBySymbol(symbol, limit);
  }

  async getRecentTrades(
    pairIdOrSymbol: string,
    limit?: number,
  ): Promise<MarketRecentTradeResponse[]> {
    return this.marketsService.getRecentTrades(pairIdOrSymbol, limit);
  }

  async getRecentTradesBySymbol(
    symbol: string,
    limit?: number,
  ): Promise<MarketRecentTradeResponse[]> {
    return this.marketsService.getRecentTradesBySymbol(symbol, limit);
  }

  async getDepthSnapshot(pairIdOrSymbol: string, depth: number): Promise<DepthSnapshot> {
    return this.marketsService.getDepthSnapshot(pairIdOrSymbol, depth);
  }

  async getDepthSnapshotBySymbol(symbol: string, depth: number): Promise<DepthSnapshot> {
    return this.marketsService.getDepthSnapshotBySymbol(symbol, depth);
  }
}
