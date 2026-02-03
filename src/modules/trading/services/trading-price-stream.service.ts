import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { RedisService } from '@/common/services';
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

  // Event listeners
  private priceUpdateListeners: ((ticker: TickerMessage) => void)[] = [];
  private candleUpdateListeners: ((candle: OHLCMessage) => void)[] = [];

  constructor(private readonly redisService: RedisService) {}

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
    this.logger.debug(`📊 Price update for pair ${event.pair_id}: ${event.ticker.last_price}`);

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
    this.logger.debug(
      `📊 Candle update for pair ${event.pair_id} (${event.candle.interval}): ${event.candle.close}`,
    );
    
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
      this.logger.debug(`📤 Published price update for pair ${ticker.pair_id}`);
    } catch (error) {
      this.logger.error('Failed to publish price update:', error);
    }
  }

  /**
   * Publish candle update to Redis
   * Called by other services (e.g., CandleAggregationService)
   */
  async publishCandleUpdate(candle: OHLCMessage) {
    try {
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
      this.logger.debug(`📤 Published candle update for pair ${candle.pair_id}`);
    } catch (error) {
      this.logger.error('Failed to publish candle update:', error);
    }
  }

  /**
   * Clean up resources
   */
  async onModuleDestroy() {
    // Redis connections are managed by RedisService
    this.priceUpdateListeners = [];
    this.candleUpdateListeners = [];
  }
}
