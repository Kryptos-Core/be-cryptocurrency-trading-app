import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { OutboxIntegrationEventType } from '@/common/integration-events/integration-event-catalog';
import type { MarketTickerUpdatedOutboxPayloadV1 } from '@/common/integration-events/market-ticker-updated-outbox-payload';
import { OutboxAppender } from '@/common/outbox/outbox-appender.service';
import { RedisService } from '@/common/services';
import { UnitOfWork } from '@/common/unit-of-work/unit-of-work';
import {
  type CandleInterval,
  type CandleUpdateEvent,
  MARKET_EVENTS,
  type OHLCMessage,
  type PriceUpdateEvent,
  type RedisPubSubMessage,
  type TickerMessage,
} from '../interfaces/websocket.interface';

const RATE_LIMIT_LOG_MS = 60_000;
const PUBLISH_RETRY_COUNT = 3;
const PUBLISH_RETRY_DELAY_MS = 100;

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
  private lastBinanceCandleAt: Map<string, number> = new Map();
  private static readonly BINANCE_CANDLE_PRIORITY_MS = 90_000;

  constructor(
    private readonly redisService: RedisService,
    private readonly eventEmitter: EventEmitter2,
    private readonly unitOfWork: UnitOfWork,
    private readonly outboxAppender: OutboxAppender,
  ) {}

  async onModuleInit() {
    await this.initializeRedisSubscriber();
  }

  private async initializeRedisSubscriber() {
    const subscriber = this.redisService.getSubscriber();
    await subscriber.subscribe('trading:price_update', 'trading:candle_update');

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
          this.logger.warn(
            'Redis subscriber message parse failed',
            err instanceof Error ? err.stack : String(err),
          );
        }
      }
    });

    subscriber.on('error', (err: Error) => {
      if (this.shouldLog('subscriber_error')) {
        this.logger.error('Redis subscriber error', err?.stack ?? err?.message ?? String(err));
      }
    });
  }

  private handlePriceUpdate(event: PriceUpdateEvent) {
    this.aggregateCandle(event);
    this.eventEmitter.emit(MARKET_EVENTS.PRICE_UPDATED, event.ticker);
  }

  private handleCandleUpdate(event: CandleUpdateEvent) {
    if ((event.source === 'binance_kline' || event.source === 'go_aggregator') && event.candle) {
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

      if (!currentKey?.endsWith(`:${openTime}`)) {
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
      await this.appendTickerUpdatedEvent(ticker);
    } else {
      this.lastPublishError = error ?? 'Unknown';
      if (this.shouldLog('publish_price')) {
        this.logger.error('Publish price update failed after retries', error);
      }
    }
  }

  private async appendTickerUpdatedEvent(ticker: TickerMessage): Promise<void> {
    const payload: MarketTickerUpdatedOutboxPayloadV1 = {
      pairId: ticker.pair_id,
      symbol: ticker.symbol,
      lastPrice: ticker.last_price,
      bid: ticker.bid,
      ask: ticker.ask,
      volume24h: ticker.volume_24h,
      volume24hUsd: ticker.volume_24h_usd,
      change24h: ticker.change_24h,
      changePercent24h: ticker.change_percent_24h,
      high24h: ticker.high_24h,
      low24h: ticker.low_24h,
      open24h: ticker.open_24h,
      timestamp: ticker.timestamp,
    };

    try {
      await this.unitOfWork.run(async (ctx) => {
        await this.outboxAppender.append(ctx as never, {
          aggregateType: 'marketTicker',
          aggregateId: ticker.pair_id,
          eventType: OutboxIntegrationEventType.MarketTickerUpdatedV1,
          payload: payload as unknown as Record<string, unknown>,
          partitionKey: ticker.pair_id,
          kafkaTopic: 'market.ticker',
        });
      });
    } catch (error) {
      if (this.shouldLog('ticker_outbox_append')) {
        this.logger.warn(
          `Failed to append market.ticker_updated outbox event: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  getPriceFeedHealth(): {
    lastSuccessfulUpdateAt: number | null;
    lastError: string | null;
  } {
    return {
      lastSuccessfulUpdateAt: this.lastSuccessfulPriceUpdateAt,
      lastError: this.lastPublishError,
    };
  }

  async publishCandleUpdate(
    candle: OHLCMessage,
    options?: { source?: 'binance_kline' | 'aggregated' | 'go_aggregator' },
  ) {
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
