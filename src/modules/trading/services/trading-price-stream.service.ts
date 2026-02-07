import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { RedisService } from '@/common/services';
import { MarketRepository } from '@/modules/markets/repositories';
import {
  PriceUpdateEvent,
  CandleUpdateEvent,
  RedisPubSubMessage,
  TickerMessage,
  OHLCMessage,
  CandleInterval,
} from '../interfaces/websocket.interface';

/**
 * Trading Price Stream Service
 * Manages real-time price data streaming from Binance
 * Uses Redis Pub/Sub for scalability across multiple server instances
 */
@Injectable()
export class TradingPriceStreamService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TradingPriceStreamService.name);

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

  /** Buffer closed candles and flush to DB in batch to avoid DDoS-ing DB on every tick */
  private readonly ohlcvPersistBuffer = new Map<string, OHLCMessage>();
  private static readonly OHLCV_FLUSH_MS = 5000;
  private ohlcvFlushTimer: NodeJS.Timeout | null = null;

  // Event listeners
  private priceUpdateListeners: ((ticker: TickerMessage) => void)[] = [];
  private candleUpdateListeners: ((candle: OHLCMessage) => void)[] = [];

  constructor(
    private readonly redisService: RedisService,
    private readonly marketRepository: MarketRepository,
  ) {}

  async onModuleInit() {
    await this.initializeRedisSubscriber();
    this.ohlcvFlushTimer = setInterval(
      () => void this.flushOhlcvBuffer(),
      TradingPriceStreamService.OHLCV_FLUSH_MS,
    );
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
        } catch (error) {
          this.logger.error(`Failed to process message from ${channel}:`, error);
        }
      });

      subscriber.on('error', (error) => {
        this.logger.error('Redis subscriber error:', error);
      });

      this.logger.log('✅ Subscribed to Redis trading channels');
    } catch (error) {
      this.logger.error('Failed to initialize Redis subscriber:', error);
      throw error;
    }
  }

  /**
   * Handle price update from Redis
   */
  private handlePriceUpdate(event: PriceUpdateEvent) {
    this.aggregateCandle(event);
    
    // Notify all listeners
    for (const listener of this.priceUpdateListeners) {
      try {
        listener(event.ticker);
      } catch (error) {
        this.logger.error('Error in price update listener:', error);
      }
    }
  }

  /**
   * Handle candle update from Redis
   */
  private handleCandleUpdate(event: CandleUpdateEvent) {
    // Notify all listeners
    for (const listener of this.candleUpdateListeners) {
      try {
        listener(event.candle);
      } catch (error) {
        this.logger.error('Error in candle update listener:', error);
      }
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
            void this.publishCandleUpdate(closed);
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
        void this.publishCandleUpdate(candle);
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
      void this.publishCandleUpdate(candle);
    }
  }

  /**
   * Register listener for price updates
   */
  onPriceUpdate(listener: (ticker: TickerMessage) => void) {
    this.priceUpdateListeners.push(listener);
  }

  /**
   * Register listener for candle updates
   */
  onCandleUpdate(listener: (candle: OHLCMessage) => void) {
    this.candleUpdateListeners.push(listener);
  }

  /**
   * Publish price update to Redis
   * Called by other services (e.g., BinanceService)
   */
  async publishPriceUpdate(ticker: TickerMessage) {
    try {
      const message: RedisPubSubMessage = {
        event: 'price_update',
        data: {
          pair_id: parseInt(ticker.pair_id as any),
          timestamp: Date.now(),
          source: 'binance',
          ticker,
        },
        timestamp: Date.now(),
      };

      const publisher = this.redisService.getPublisher();
      await publisher.publish('trading:price_update', JSON.stringify(message));
    } catch (error) {
      this.logger.error('Failed to publish price update:', error);
    }
  }

  /**
   * Queue candle for DB persist only when it is closed.
   * Prevents DDoS on DB: no write on every tick, only closed candles are buffered and flushed in batch.
   */
  private persistCandleToDb(candle: OHLCMessage): void {
    if (!candle.is_closed) return;
    const intervalSec = this.intervalMsMap[candle.interval] / 1000;
    const key = `${candle.pair_id}:${intervalSec}:${candle.open_time}`;
    this.ohlcvPersistBuffer.set(key, candle);
  }

  /**
   * Publish candle update to Redis
   * Called by other services (e.g., CandleAggregationService)
   */
  async publishCandleUpdate(candle: OHLCMessage) {
    try {
      this.persistCandleToDb(candle);

      const message: RedisPubSubMessage = {
        event: 'candle_update',
        data: {
          pair_id: candle.pair_id,
          timestamp: Date.now(),
          candle,
        },
        timestamp: Date.now(),
      };

      const publisher = this.redisService.getPublisher();
      await publisher.publish('trading:candle_update', JSON.stringify(message));
    } catch (error) {
      this.logger.error('Failed to publish candle update:', error);
    }
  }

  /**
   * Clean up resources
   */
  async onModuleDestroy() {
    if (this.ohlcvFlushTimer) {
      clearInterval(this.ohlcvFlushTimer);
      this.ohlcvFlushTimer = null;
    }
    await this.flushOhlcvBuffer();
    this.priceUpdateListeners = [];
    this.candleUpdateListeners = [];
  }

  /**
   * Flush buffered closed candles to DB in one batch (reduces DB load).
   */
  private async flushOhlcvBuffer(): Promise<void> {
    if (this.ohlcvPersistBuffer.size === 0) return;
    const snapshot = Array.from(this.ohlcvPersistBuffer.values());
    this.ohlcvPersistBuffer.clear();
    try {
      const intervalMsMap = this.intervalMsMap;
      const rows = snapshot.map((c) => ({
        pairId: c.pair_id,
        intervalSec: intervalMsMap[c.interval] / 1000,
        openTime: new Date(c.open_time),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume ?? '0',
      }));
      await this.marketRepository.upsertOHLCVBatch(rows);
    } catch (err) {
      this.logger.warn(
        `Failed to flush OHLCV buffer (${snapshot.length} candles): ${(err as Error)?.message ?? err}`,
      );
      // Re-enqueue so next flush can retry (optional; could drop to avoid duplicates)
      for (const c of snapshot) {
        const key = `${c.pair_id}:${this.intervalMsMap[c.interval] / 1000}:${c.open_time}`;
        this.ohlcvPersistBuffer.set(key, c);
      }
    }
  }
}
