import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { RedisService } from '@/common/services';
import {
  PriceUpdateEvent,
  CandleUpdateEvent,
  RedisPubSubMessage,
  TickerMessage,
  OHLCMessage,
} from '../interfaces/websocket.interface';

/**
 * Trading Price Stream Service
 * Manages real-time price data streaming from Binance
 * Uses Redis Pub/Sub for scalability across multiple server instances
 */
@Injectable()
export class TradingPriceStreamService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TradingPriceStreamService.name);

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
