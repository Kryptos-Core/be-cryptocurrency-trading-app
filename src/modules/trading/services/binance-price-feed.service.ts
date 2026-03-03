import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '@/common/services';
import { TradingPriceStreamService } from './trading-price-stream.service';
import { MarketRepository } from '@/modules/markets/repositories';
import { TickerMessage } from '../interfaces/websocket.interface';
import { BinanceWebSocketPriceFeedClient } from '../clients/binance-websocket-price-feed.client';
import { SymbolToPairIdResolver } from '../interfaces/price-feed.interface';

const RATE_LIMIT_LOG_MS = 60_000;

/**
 * Binance Price Feed Service
 * Uses Binance WebSocket Streams (combined @ticker) for real-time price data and publishes to Redis.
 * Avoids REST rate limits (418) and supports automatic reconnect with exponential backoff.
 */
@Injectable()
export class BinancePriceFeedService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BinancePriceFeedService.name);
  private lastLogAt: Record<string, number> = {};
  private readonly baseUrl: string;
  private readonly pairSymbolMap: Map<string, string> = new Map(); // pair_id -> symbol
  private isRunning: boolean = false;
  private readonly priceFeedClient: BinanceWebSocketPriceFeedClient;

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    private readonly tradingPriceStreamService: TradingPriceStreamService,
    private readonly marketRepository: MarketRepository,
  ) {
    this.baseUrl = 'https://api.binance.com/api/v3';
    this.priceFeedClient = new BinanceWebSocketPriceFeedClient();
  }

  private shouldLog(key: string, windowMs: number = RATE_LIMIT_LOG_MS): boolean {
    const now = Date.now();
    if (now - (this.lastLogAt[key] ?? 0) < windowMs) return false;
    this.lastLogAt[key] = now;
    return true;
  }

  async onModuleInit() {
    await this.loadPairSymbolMapping();
    await this.startPriceFeed();
  }

  /**
   * Load mapping from database: pair_id -> symbol.
   */
  private async loadPairSymbolMapping(): Promise<void> {
    try {
      const activePairs = await this.marketRepository.findActive();
      this.pairSymbolMap.clear();
      for (const pair of activePairs) {
        const normalizedSymbol = String(pair.symbol)
          .toUpperCase()
          .replace(/[^A-Z0-9]/g, '');
        if (!normalizedSymbol) continue;
        this.pairSymbolMap.set(String(pair.pair_id), normalizedSymbol);
      }
    } catch (err) {
      if (this.shouldLog('load_pair_mapping')) {
        this.logger.error('Load pair symbol mapping failed', err instanceof Error ? err.stack : String(err));
      }
    }
  }

  private getPairIdForSymbolResolver(): SymbolToPairIdResolver {
    const symbolToPairId = new Map<string, string>();
    for (const [pairId, symbol] of this.pairSymbolMap.entries()) {
      symbolToPairId.set(symbol, pairId);
    }
    return (symbol: string) => symbolToPairId.get(symbol);
  }

  /**
   * Start price feed via Binance WebSocket (combined ticker stream).
   * @param forceReconnect when true, reconnects even if already running (e.g. after add/remove pair).
   */
  private async startPriceFeed(forceReconnect = false): Promise<void> {
    if (!forceReconnect && this.isRunning) return;
    const symbols = this.getTrackedSymbols();
    if (symbols.length === 0) {
      this.logger.log('No pairs configured; price feed not started.');
      if (!forceReconnect) this.isRunning = false;
      return;
    }
    this.isRunning = true;

    this.priceFeedClient.onTicker(async (ticker: TickerMessage) => {
      try {
        await this.tradingPriceStreamService.publishPriceUpdate(ticker);
        const key = `price:${ticker.symbol}:latest`;
        await this.redisService.set(key, JSON.stringify(ticker), 300);
      } catch (err) {
        if (this.shouldLog('publish_ticker')) {
          this.logger.warn('Publish ticker failed', err instanceof Error ? err.stack : String(err));
        }
      }
    });

    await this.priceFeedClient.connect(symbols, this.getPairIdForSymbolResolver());
  }

  /**
   * Get current price for a symbol (one-off REST call; use sparingly).
   */
  async getCurrentPrice(symbol: string): Promise<number | null> {
    try {
      const url = `${this.baseUrl}/ticker/price?symbol=${symbol}`;
      const response = await fetch(url);
      if (!response.ok) return null;
      const data = (await response.json()) as { price?: string };
      return data.price != null ? parseFloat(data.price) : null;
    } catch {
      return null;
    }
  }

  /**
   * Add a pair; reconnects WebSocket with updated symbol list.
   */
  async addPair(pairId: string, symbol: string): Promise<void> {
    const normalized = String(symbol).toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!normalized || this.pairSymbolMap.has(pairId)) return;
    this.pairSymbolMap.set(pairId, normalized);
    if (this.isRunning) {
      await this.priceFeedClient.disconnect();
      await this.startPriceFeed(true);
    }
  }

  /**
   * Remove a pair; reconnects WebSocket with updated symbol list.
   */
  async removePair(pairId: string): Promise<void> {
    if (!this.pairSymbolMap.has(pairId)) return;
    this.pairSymbolMap.delete(pairId);
    if (this.isRunning) {
      await this.priceFeedClient.disconnect();
      if (this.pairSymbolMap.size > 0) {
        await this.startPriceFeed(true);
      } else {
        this.isRunning = false;
      }
    }
  }

  getTrackedSymbols(): string[] {
    return Array.from(this.pairSymbolMap.values());
  }

  getStats(): {
    isRunning: boolean;
    trackedPairs: number;
    symbols: string[];
    feedType: string;
    connected: boolean;
  } {
    return {
      isRunning: this.isRunning,
      trackedPairs: this.pairSymbolMap.size,
      symbols: this.getTrackedSymbols(),
      feedType: 'websocket',
      connected: this.priceFeedClient.isConnected(),
    };
  }

  async stopPriceFeed(): Promise<void> {
    this.isRunning = false;
    await this.priceFeedClient.disconnect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.stopPriceFeed();
  }
}
