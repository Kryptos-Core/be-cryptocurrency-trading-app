import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { RedisService } from '@/common/services';
import {
  PriceUpdateEvent,
  CandleUpdateEvent,
  RedisPubSubMessage,
  TickerMessage,
  OHLCMessage,
  CandleInterval,
  MARKET_EVENTS,
} from '../interfaces/websocket.interface';

const RATE_LIMIT_LOG_MS = 60_000;
const PUBLISH_RETRY_COUNT = 3;
const PUBLISH_RETRY_DELAY_MS = 100;

/**
 * Trading Price Stream Service
 * Manages real-time price data streaming; uses Redis Pub/Sub for scalability.
 * OHLCV is no longer persisted to DB: chart/ticker data is fetched on-demand via
 * Price Oracle (Binance time-range APIs).
 */
@Injectable()
export class TradingPriceStreamService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TradingPriceStreamService.name);
  private lastLogAt: Record<string, number> = {};
  private lastSuccessfulPriceUpdateAt: number | null = null;
  private lastPublishError: string | null = null;

  private readonly intervalMsMap: Record<CandleInterval, number> = {
    '1m': 60_000,
    '5m': 5 * 60_000,
    '15m': 15 * 60_000,
    '1h': 60 * 60_000,
    '4h': 4 * 60 * 60_000,
    '1d': 24 * 60 * 60_000,
  };

  private candleCache: Map<string, OHLCMessage> = new Map();
  private candleKeyByPairInterval: Map<string, string> = new Map();
  /** When a (pair_id, interval) has recent Binance kline, skip overwriting with aggregated ticker. TTL 90s. */
  private lastBinanceCandleAt: Map<string, number> = new Map();
  private static readonly BINANCE_CANDLE_PRIORITY_MS = 90_000;

  constructor(
    private readonly redisService: RedisService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async onModuleInit() {
    await this.initializeRedisSubscriber();
  }

  /**
   * Initialize Redis Pub/Sub subscriber
   */
  private async initializeRedisSubscriber() {
    try {
      // Get subscriber client from RedisService
      const subscriber = this.redisService.getSubscriber();

      // Subscribe to trading channels
      await subscriber.subscribe('trading:price_update', 'trading:candle_update');

      // Listen for messages
      subscriber.on('message', (channel: string, message: string) => {
        try {
          const data = JSON.parse(message) as RedisPubSubMessage;
          
          if (channel === 'trading:price_update') {
            this.handlePriceUpdate(data.data as PriceUpdateEvent);
          } else if (channel === 'trading:candle_update') {
            this.handleCandleUpdate(data.data as CandleUpdateEvent);
          }
        } catch (err) {
          if (this.shouldLog('subscriber_message')) {
            this.logger.warn('Redis subscriber message parse failed', err instanceof Error ? err.stack : String(err));
          }
        }
      });

      subscriber.on('error', (err: Error) => {
        if (this.shouldLog('subscriber_error')) {
          this.logger.error('Redis subscriber error', err?.stack ?? err?.message ?? String(err));
        }
      });
    } catch (error) {
      throw error;
    }
  }

  /**
   * Handle price update from Redis — emit to EventEmitter2 Observer bus.
   */
  private handlePriceUpdate(event: PriceUpdateEvent) {
    this.aggregateCandle(event);
    this.eventEmitter.emit(MARKET_EVENTS.PRICE_UPDATED, event.ticker);
  }

  /**
   * Handle candle update from Redis — emit to EventEmitter2 Observer bus.
   * Distinguishes between an in-progress candle update and a closed candle.
   */
  private handleCandleUpdate(event: CandleUpdateEvent) {
    if (event.source === 'binance_kline' && event.candle) {
      const key = `${event.candle.pair_id}:${event.candle.interval}`;
      this.lastBinanceCandleAt.set(key, Date.now());
    }
    this.eventEmitter.emit(MARKET_EVENTS.CANDLE_UPDATED, event.candle);
    if (event.candle.is_closed) {
      this.eventEmitter.emit(MARKET_EVENTS.CANDLE_CLOSED, event.candle);
    }
  }

  private aggregateCandle(event: PriceUpdateEvent) {
    const price = Number(event.ticker.last_price);
    if (!Number.isFinite(price)) {
      return;
    }

    const timestamp = event.timestamp || Date.now();
    const priceString = event.ticker.last_price;

    for (const [interval, intervalMs] of Object.entries(this.intervalMsMap) as [
      CandleInterval,
      number,
    ][]) {
      const openTime = Math.floor(timestamp / intervalMs) * intervalMs;
      const pairIntervalKey = `${event.pair_id}:${interval}`;
      const currentKey = this.candleKeyByPairInterval.get(pairIntervalKey);

      if (!currentKey || !currentKey.endsWith(`:${openTime}`)) {
        if (currentKey) {
          const prev = this.candleCache.get(currentKey);
          if (prev) {
        const closed = {
          ...prev,
          close_time: openTime,
          is_closed: true,
        };
        this.candleCache.set(currentKey, closed);
        if (!this.shouldSkipAggregateForPairInterval(event.pair_id, interval)) {
          void this.publishCandleUpdate(closed, { source: 'aggregated' });
        }
      }
    }

    const newKey = `${pairIntervalKey}:${openTime}`;
        const candle: OHLCMessage = {
          pair_id: event.pair_id,
          symbol: event.ticker.symbol,
          interval,
          open_time: openTime,
          close_time: openTime + intervalMs,
          open: priceString,
          high: priceString,
          low: priceString,
          close: priceString,
          volume: '0',
          quote_volume: '0',
          trades_count: 0,
          is_closed: false,
        };

        this.candleCache.set(newKey, candle);
        this.candleKeyByPairInterval.set(pairIntervalKey, newKey);
        if (!this.shouldSkipAggregateForPairInterval(event.pair_id, interval)) {
          void this.publishCandleUpdate(candle, { source: 'aggregated' });
        }
        continue;
      }

      const candle = this.candleCache.get(currentKey);
      if (!candle) {
        continue;
      }

      const high = Math.max(Number(candle.high), price);
      const low = Math.min(Number(candle.low), price);

      candle.high = String(high);
      candle.low = String(low);
      candle.close = priceString;
      candle.close_time = openTime + intervalMs;

      this.candleCache.set(currentKey, candle);
      if (!this.shouldSkipAggregateForPairInterval(event.pair_id, interval)) {
        void this.publishCandleUpdate(candle, { source: 'aggregated' });
      }
    }
  }

  private shouldSkipAggregateForPairInterval(pairId: string, interval: CandleInterval): boolean {
    const key = `${pairId}:${interval}`;
    const at = this.lastBinanceCandleAt.get(key);
    if (at == null) return false;
    const now = Date.now();
    if (now - at > TradingPriceStreamService.BINANCE_CANDLE_PRIORITY_MS) {
      this.lastBinanceCandleAt.delete(key);
      return false;
    }
    return true;
  }

  private shouldLog(key: string, windowMs: number = RATE_LIMIT_LOG_MS): boolean {
    const now = Date.now();
    if (now - (this.lastLogAt[key] ?? 0) < windowMs) return false;
    this.lastLogAt[key] = now;
    return true;
  }

  private async publishWithRetry<T>(
    fn: () => Promise<T>,
  ): Promise<{ ok: boolean; error?: string }> {
    let lastErr: Error | null = null;
    for (let i = 0; i < PUBLISH_RETRY_COUNT; i++) {
      try {
        await fn();
        return { ok: true };
      } catch (err) {
        lastErr = err instanceof Error ? err : new Error(String(err));
        if (i < PUBLISH_RETRY_COUNT - 1) {
          await new Promise((r) => setTimeout(r, PUBLISH_RETRY_DELAY_MS));
        }
      }
    }
    const msg = lastErr?.message ?? String(lastErr);
    return { ok: false, error: msg };
  }

  /**
   * Publish price update to Redis (with retry).
   * Called by other services (e.g., BinancePriceFeedService).
   */
  async publishPriceUpdate(ticker: TickerMessage) {
    const message: RedisPubSubMessage = {
      event: 'price_update',
      data: {
        pair_id: ticker.pair_id,
        timestamp: Date.now(),
        source: 'binance',
        ticker,
      },
      timestamp: Date.now(),
    };
    const payload = JSON.stringify(message);
    const { ok, error } = await this.publishWithRetry(async () => {
      const publisher = this.redisService.getPublisher();
      await publisher.publish('trading:price_update', payload);
    });
    if (ok) {
      this.lastSuccessfulPriceUpdateAt = Date.now();
      this.lastPublishError = null;
    } else {
      this.lastPublishError = error ?? 'Unknown';
      if (this.shouldLog('publish_price')) {
        this.logger.error('Publish price update failed after retries', error);
      }
    }
  }

  /**
   * Health state for price feed (e.g. monitoring / admin).
   */
  getPriceFeedHealth(): {
    lastSuccessfulUpdateAt: number | null;
    lastError: string | null;
  } {
    return {
      lastSuccessfulUpdateAt: this.lastSuccessfulPriceUpdateAt,
      lastError: this.lastPublishError,
    };
  }

  /**
   * Publish candle update to Redis (real-time only; no DB persist). Uses retry.
   * source: 'binance_kline' so downstream can prefer it over aggregated ticker.
   */
  async publishCandleUpdate(candle: OHLCMessage, options?: { source?: 'binance_kline' | 'aggregated' }) {
    const message: RedisPubSubMessage = {
      event: 'candle_update',
      data: {
        pair_id: candle.pair_id,
        timestamp: Date.now(),
        candle,
        ...(options?.source && { source: options.source }),
      },
      timestamp: Date.now(),
    };
    const payload = JSON.stringify(message);
    const { ok, error } = await this.publishWithRetry(async () => {
      const publisher = this.redisService.getPublisher();
      await publisher.publish('trading:candle_update', payload);
    });
    if (!ok && this.shouldLog('publish_candle')) {
      this.logger.error('Publish candle update failed after retries', error);
    }
  }

  async onModuleDestroy() {
    this.candleCache.clear();
    this.candleKeyByPairInterval.clear();
    this.lastBinanceCandleAt.clear();
  }
}
