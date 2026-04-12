import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { RedisService } from '@/common/services';
import { BinanceRestClient } from '@/modules/binance-rest/binance-rest-client.service';
import { MarketRepository } from '@/modules/markets/repositories';
import { BinanceWebSocketPriceFeedClient } from '../clients/binance-websocket-price-feed.client';
import type { SymbolToPairIdResolver } from '../interfaces/price-feed.interface';
import {
  MARKET_EVENTS,
  type OHLCMessage,
  type OhlcSubscriptionEvent,
  type TickerMessage,
} from '../interfaces/websocket.interface';
import { TradingPriceStreamService } from './trading-price-stream.service';
import { TradingSubscriptionService } from './trading-subscription.service';

const RATE_LIMIT_LOG_MS = 60_000;
const DEBOUNCE_RECONNECT_MS = 4000;
const MAX_TICKER_SYMBOLS = 80;
const DEFAULT_SYMBOLS = ['BTCUSDT', 'ETHUSDT'];
const EXCHANGE_INFO_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Binance Price Feed Service
 * Uses Binance WebSocket Streams (combined @ticker) for real-time price data and publishes to Redis.
 * Subscribe on-demand: only symbols that have at least one client subscription; debounce reconnect to avoid rate limit.
 */
@Injectable()
export class BinancePriceFeedService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BinancePriceFeedService.name);
  private lastLogAt: Record<string, number> = {};
  private readonly pairSymbolMap: Map<string, string> = new Map(); // pair_id -> symbol
  private requestedTickerSymbols: string[] = [];
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private isRunning: boolean = false;
  private readonly priceFeedClient: BinanceWebSocketPriceFeedClient;
  private binanceSymbolsCache: Set<string> = new Set();
  private binanceSymbolsCacheExpiry = 0;

  /** Demand-based kline symbols: pair_id -> symbol. Populated via EventEmitter2 OHLC events. */
  private readonly activeKlineSymbols = new Map<string, string>(); // pair_id -> symbol

  constructor(
    readonly _configService: ConfigService,
    private readonly binanceRestClient: BinanceRestClient,
    private readonly redisService: RedisService,
    private readonly tradingPriceStreamService: TradingPriceStreamService,
    private readonly tradingSubscriptionService: TradingSubscriptionService,
    private readonly marketRepository: MarketRepository,
  ) {
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
    await this.requestSymbolsForSubscriptions();
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
        this.logger.error(
          'Load pair symbol mapping failed',
          err instanceof Error ? err.stack : String(err),
        );
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
   * Fetch Binance exchangeInfo and cache symbol list (1h TTL). Only subscribe to symbols that exist on Binance.
   */
  private async getBinanceSymbolsSet(): Promise<Set<string>> {
    const now = Date.now();
    if (this.binanceSymbolsCache.size > 0 && now < this.binanceSymbolsCacheExpiry) {
      return this.binanceSymbolsCache;
    }
    try {
      const data = await this.binanceRestClient.getPublicJson<{
        symbols?: Array<{ symbol?: string }>;
      }>('/api/v3/exchangeInfo');
      const symbols = data.symbols ?? [];
      this.binanceSymbolsCache = new Set(
        symbols.map((s) => String(s.symbol ?? '').toUpperCase()).filter(Boolean),
      );
      this.binanceSymbolsCacheExpiry = now + EXCHANGE_INFO_CACHE_TTL_MS;
    } catch (err) {
      if (this.shouldLog('exchange_info')) {
        this.logger.warn(
          'ExchangeInfo fetch failed',
          err instanceof Error ? err.message : String(err),
        );
      }
    }
    return this.binanceSymbolsCache;
  }

  /**
   * Called when subscriptions change. Builds symbol set from subscribed pair IDs, filters by Binance, debounces, then reconnects.
   */
  async requestSymbolsForSubscriptions(): Promise<void> {
    await this.loadPairSymbolMapping();
    const binanceSet = await this.getBinanceSymbolsSet();
    const pairIds = this.tradingSubscriptionService.getSubscribedPairIds();
    const symbolSet = new Set<string>();
    for (const pairId of pairIds) {
      const symbol = this.pairSymbolMap.get(String(pairId));
      if (symbol && (binanceSet.size === 0 || binanceSet.has(symbol))) symbolSet.add(symbol);
    }
    for (const s of DEFAULT_SYMBOLS) {
      if (this.pairSymbolMap.size > 0) {
        const hasSymbol = Array.from(this.pairSymbolMap.values()).some((v) => v === s);
        if (hasSymbol && (binanceSet.size === 0 || binanceSet.has(s))) symbolSet.add(s);
      }
    }
    let symbols = Array.from(symbolSet).sort();
    if (symbols.length > MAX_TICKER_SYMBOLS) {
      symbols = symbols.slice(0, MAX_TICKER_SYMBOLS);
    }
    const prev = new Set(this.requestedTickerSymbols);
    const same = symbols.length === prev.size && symbols.every((s) => prev.has(s));
    if (same) return;
    this.requestedTickerSymbols = symbols;

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      void this.startPriceFeed(true);
    }, DEBOUNCE_RECONNECT_MS);
  }

  /**
   * Observer: first client subscribes to ohlc for a pair → add kline symbol.
   */
  @OnEvent(MARKET_EVENTS.OHLC_SUBSCRIPTION_ADDED)
  onOhlcSubscriptionAdded(event: OhlcSubscriptionEvent): void {
    const normalized = String(event.symbol)
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
    if (!normalized) return;
    const had = this.activeKlineSymbols.has(event.pair_id);
    this.activeKlineSymbols.set(event.pair_id, normalized);
    if (!had) {
      this.logger.log(`Kline subscription added: ${normalized} (pair ${event.pair_id})`);
      void this.requestSymbolsForSubscriptions();
    }
  }

  /**
   * Observer: last client unsubscribes from ohlc for a pair → remove kline symbol.
   */
  @OnEvent(MARKET_EVENTS.OHLC_SUBSCRIPTION_REMOVED)
  onOhlcSubscriptionRemoved(event: OhlcSubscriptionEvent): void {
    if (!this.activeKlineSymbols.has(event.pair_id)) return;
    this.activeKlineSymbols.delete(event.pair_id);
    this.logger.log(`Kline subscription removed: ${event.symbol} (pair ${event.pair_id})`);
    void this.requestSymbolsForSubscriptions();
  }

  /**
   * Start price feed via Binance WebSocket (combined ticker stream).
   * klineSymbols are demand-driven via EventEmitter2 OHLC events — no hardcoded limit.
   * @param forceReconnect when true, reconnects even if already running (e.g. after symbol set change).
   */
  private async startPriceFeed(forceReconnect = false): Promise<void> {
    if (!forceReconnect && this.isRunning) return;
    const symbols = this.getTrackedSymbols();
    if (symbols.length === 0) {
      this.logger.log('No symbols requested; price feed not started.');
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

    this.priceFeedClient.onCandle(async (candle: OHLCMessage) => {
      try {
        await this.tradingPriceStreamService.publishCandleUpdate(candle, {
          source: 'binance_kline',
        });
      } catch (err) {
        if (this.shouldLog('publish_candle')) {
          this.logger.warn('Publish candle failed', err instanceof Error ? err.stack : String(err));
        }
      }
    });

    // Demand-based kline symbols — populated by @OnEvent handlers above
    const klineSymbols: string[] = [];
    for (const sym of this.activeKlineSymbols.values()) {
      if (this.binanceSymbolsCache.size === 0 || this.binanceSymbolsCache.has(sym)) {
        klineSymbols.push(sym);
      }
    }

    await this.priceFeedClient.connect(symbols, this.getPairIdForSymbolResolver(), {
      klineSymbols: klineSymbols.length > 0 ? klineSymbols : undefined,
    });
  }

  /**
   * Get current price for a symbol (one-off REST call; use sparingly).
   */
  async getCurrentPrice(symbol: string): Promise<number | null> {
    try {
      const data = await this.binanceRestClient.getPublicJson<{ price?: string }>(
        '/api/v3/ticker/price',
        { symbol },
      );
      return data.price != null ? parseFloat(data.price) : null;
    } catch {
      return null;
    }
  }

  /**
   * Add a pair to resolution map; refreshes subscription-based symbol set (debounced).
   */
  async addPair(pairId: string, symbol: string): Promise<void> {
    const normalized = String(symbol)
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
    if (!normalized || this.pairSymbolMap.has(pairId)) return;
    this.pairSymbolMap.set(pairId, normalized);
    await this.requestSymbolsForSubscriptions();
  }

  /**
   * Remove a pair from resolution map; refreshes subscription-based symbol set (debounced).
   */
  async removePair(pairId: string): Promise<void> {
    if (!this.pairSymbolMap.has(pairId)) return;
    this.pairSymbolMap.delete(pairId);
    await this.requestSymbolsForSubscriptions();
  }

  getTrackedSymbols(): string[] {
    return this.requestedTickerSymbols.length > 0 ? [...this.requestedTickerSymbols] : [];
  }

  /**
   * Resolve Binance symbol for a pair_id (from in-memory map loaded at startup).
   * Used by gateway to pass symbol to subscription service for demand-based kline events.
   */
  getSymbolForPair(pairId: string): string | undefined {
    return this.pairSymbolMap.get(String(pairId));
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
      trackedPairs: this.requestedTickerSymbols.length,
      symbols: this.getTrackedSymbols(),
      feedType: 'websocket',
      connected: this.priceFeedClient.isConnected(),
    };
  }

  async stopPriceFeed(): Promise<void> {
    this.isRunning = false;
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    await this.priceFeedClient.disconnect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.stopPriceFeed();
  }
}
