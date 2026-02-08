import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '@/common/services';
import { TradingPriceStreamService } from './trading-price-stream.service';
import { MarketRepository } from '@/modules/markets/repositories';
import { TickerMessage } from '../interfaces/websocket.interface';

/**
 * Binance Price Feed Service
 * Fetches real-time price data from Binance mainnet API and publishes to Redis
 * Supports both Spot and Futures markets
 */
@Injectable()
export class BinancePriceFeedService implements OnModuleInit, OnModuleDestroy {
  private readonly baseUrl: string;
  private priceFeedIntervals: Map<number, NodeJS.Timeout> = new Map();
  private readonly updateIntervalMs: number = 1000; // 1 second between updates
  private readonly pairSymbolMap: Map<number, string> = new Map(); // pair_id -> symbol
  private isRunning: boolean = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    private readonly tradingPriceStreamService: TradingPriceStreamService,
    private readonly marketRepository: MarketRepository,
  ) {
    // Use mainnet Spot API by default
    this.baseUrl = 'https://api.binance.com/api/v3';
  }

  async onModuleInit() {
    await this.loadPairSymbolMapping();
    await this.startPriceFeed();
  }

  /**
   * Load mapping from database: pair_id -> symbol.
   * Uses repository directly to avoid stale cache (e.g. empty list from before db:seed).
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

        this.pairSymbolMap.set(pair.pair_id, normalizedSymbol);
      }

    } catch {
      // Pair mapping load failed (silent)
    }
  }

  /**
   * Start price feed for all configured pairs
   */
  private async startPriceFeed(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    for (const [pairId, symbol] of this.pairSymbolMap.entries()) {
      this.startPairPriceFeed(pairId, symbol);
    }
  }

  /**
   * Start price feed for a specific trading pair
   */
  private startPairPriceFeed(pairId: number, symbol: string): void {
    // Initial fetch
    this.fetchAndPublishPrice(pairId, symbol);

    // Set up interval for continuous updates
    const interval = setInterval(() => {
      this.fetchAndPublishPrice(pairId, symbol);
    }, this.updateIntervalMs);

    this.priceFeedIntervals.set(pairId, interval);
  }

  /**
   * Fetch price from Binance and publish to Redis
   */
  private async fetchAndPublishPrice(pairId: number, symbol: string): Promise<void> {
    try {
      // Fetch 24h ticker data from Binance
      const tickerData = await this.fetchTicker24h(symbol);

      if (!tickerData) return;

      // Build ticker message
      const tickerMessage: TickerMessage = {
        pair_id: pairId,
        symbol: symbol,
        last_price: String(tickerData.lastPrice),
        bid: String(tickerData.bidPrice || '0'),
        ask: String(tickerData.askPrice || '0'),
        volume_24h: String(tickerData.volume),
        volume_24h_usd: String(tickerData.quoteAssetVolume || '0'),
        change_24h: String(tickerData.priceChange || '0'),
        change_percent_24h: String(tickerData.priceChangePercent),
        high_24h: String(tickerData.highPrice),
        low_24h: String(tickerData.lowPrice),
        open_24h: String(tickerData.openPrice || '0'),
        timestamp: String(Date.now()),
      };

      // Publish to Redis and notify listeners
      await this.tradingPriceStreamService.publishPriceUpdate(tickerMessage);

      // Also log to Redis for analytics (optional)
      const key = `price:${symbol}:latest`;
      await this.redisService.set(
        key,
        JSON.stringify(tickerMessage),
        300, // 5 minute TTL
      );
    } catch {
      // Fetch/publish failed (silent)
    }
  }

  /**
   * Fetch 24h ticker data from Binance Spot API
   * GET /api/v3/ticker/24hr
   */
  private async fetchTicker24h(symbol: string): Promise<any> {
    try {
      const url = `${this.baseUrl}/ticker/24hr?symbol=${symbol}`;
      const response = await fetch(url);

      if (!response.ok) return null;

      const data: any = await response.json();

      return {
        symbol: data.symbol,
        lastPrice: data.lastPrice,
        highPrice: data.highPrice,
        lowPrice: data.lowPrice,
        volume: data.volume,
        quoteAssetVolume: data.quoteAssetVolume,
        priceChangePercent: data.priceChangePercent,
        priceChange: data.priceChange,
        openPrice: data.openPrice,
        closePrice: data.closePrice,
        askPrice: data.askPrice,
        askQty: data.askQty,
        bidPrice: data.bidPrice,
        bidQty: data.bidQty,
        openTime: data.openTime,
        closeTime: data.closeTime,
        count: data.count,
      };
    } catch {
      return null;
    }
  }

  /**
   * Get current price for a specific symbol
   * Useful for immediate price checks
   */
  async getCurrentPrice(symbol: string): Promise<number | null> {
    try {
      const url = `${this.baseUrl}/ticker/price?symbol=${symbol}`;
      const response = await fetch(url);

      if (!response.ok) {
        return null;
      }

      const data: any = await response.json();
      return parseFloat(data.price);
    } catch {
      return null;
    }
  }

  /**
   * Add a new pair to the price feed
   */
  async addPair(pairId: number, symbol: string): Promise<void> {
    if (this.pairSymbolMap.has(pairId)) return;
    this.pairSymbolMap.set(pairId, symbol);
    if (this.isRunning) this.startPairPriceFeed(pairId, symbol);
  }

  /**
   * Remove a pair from the price feed
   */
  async removePair(pairId: number): Promise<void> {
    const interval = this.priceFeedIntervals.get(pairId);
    if (interval) {
      clearInterval(interval);
      this.priceFeedIntervals.delete(pairId);
      this.pairSymbolMap.delete(pairId);
    }
  }

  /**
   * Get list of tracked symbols
   */
  getTrackedSymbols(): string[] {
    return Array.from(this.pairSymbolMap.values());
  }

  /**
   * Get feed statistics
   */
  getStats(): {
    isRunning: boolean;
    trackedPairs: number;
    symbols: string[];
    updateIntervalMs: number;
  } {
    return {
      isRunning: this.isRunning,
      trackedPairs: this.pairSymbolMap.size,
      symbols: this.getTrackedSymbols(),
      updateIntervalMs: this.updateIntervalMs,
    };
  }

  /**
   * Stop price feed
   */
  async stopPriceFeed(): Promise<void> {
    this.isRunning = false;

    for (const interval of this.priceFeedIntervals.values()) {
      clearInterval(interval);
    }

    this.priceFeedIntervals.clear();
  }

  /**
   * Cleanup on module destroy
   */
  async onModuleDestroy(): Promise<void> {
    await this.stopPriceFeed();
  }
}
