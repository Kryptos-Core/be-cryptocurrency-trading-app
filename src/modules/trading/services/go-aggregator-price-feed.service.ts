import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '@/common/services';
import type { OHLCMessage, TickerMessage } from '../interfaces/websocket.interface';
import { TradingPriceStreamService } from './trading-price-stream.service';
import { PublicWsPayloadParityService } from './public-ws-payload-parity.service';

const DEFAULT_TICKER_CHANNEL = 'trading:external:ticker';
const DEFAULT_OHLC_CHANNEL = 'trading:external:ohlc';

type ExternalMessage<T> =
  | T
  | {
      data?: T;
      payload?: T;
      ticker?: TickerMessage;
      candle?: OHLCMessage;
    };

@Injectable()
export class GoAggregatorPriceFeedService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GoAggregatorPriceFeedService.name);

  private readonly tickerSource: string;
  private readonly tickerChannel: string;
  private readonly ohlcChannel: string;

  private subscriberBound = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    private readonly tradingPriceStreamService: TradingPriceStreamService,
    private readonly payloadParityService: PublicWsPayloadParityService,
  ) {
    this.tickerSource = (this.configService.get<string>('TICKER_SOURCE') ?? 'nestjs')
      .trim()
      .toLowerCase();
    this.tickerChannel =
      (this.configService.get<string>('GO_AGGREGATOR_TICKER_CHANNEL') ?? DEFAULT_TICKER_CHANNEL)
        .trim() || DEFAULT_TICKER_CHANNEL;
    this.ohlcChannel =
      (this.configService.get<string>('GO_AGGREGATOR_OHLC_CHANNEL') ?? DEFAULT_OHLC_CHANNEL).trim() ||
      DEFAULT_OHLC_CHANNEL;
  }

  async onModuleInit(): Promise<void> {
    if (this.tickerSource !== 'go_aggregator') {
      return;
    }

    const subscriber = this.redisService.getSubscriber();
    await subscriber.subscribe(this.tickerChannel, this.ohlcChannel);

    subscriber.on('message', this.handleMessage);
    this.subscriberBound = true;

    this.logger.log(
      `Go aggregator ingress enabled (channels: ${this.tickerChannel}, ${this.ohlcChannel})`,
    );
  }

  async onModuleDestroy(): Promise<void> {
    if (this.tickerSource !== 'go_aggregator') {
      return;
    }

    const subscriber = this.redisService.getSubscriber();

    if (this.subscriberBound) {
      subscriber.off('message', this.handleMessage);
      this.subscriberBound = false;
    }

    try {
      await subscriber.unsubscribe(this.tickerChannel, this.ohlcChannel);
    } catch {
      // best effort
    }
  }

  private readonly handleMessage = async (channel: string, raw: string): Promise<void> => {
    if (channel !== this.tickerChannel && channel !== this.ohlcChannel) {
      return;
    }

    try {
      if (channel === this.tickerChannel) {
        const ticker = this.parseTicker(raw);
        if (!ticker) return;

        this.payloadParityService.recordExternalTicker(ticker);
        await this.tradingPriceStreamService.publishPriceUpdate(ticker);
        return;
      }

      const ohlc = this.parseOhlc(raw);
      if (!ohlc) return;

      await this.tradingPriceStreamService.publishCandleUpdate(ohlc, {
        source: 'go_aggregator',
      });
    } catch (error) {
      this.logger.warn(
        `Failed to ingest message from ${channel}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

  private parseTicker(raw: string): TickerMessage | null {
    const payload = JSON.parse(raw) as ExternalMessage<TickerMessage>;
    const candidate =
      this.pickObject<TickerMessage>(payload, ['ticker']) ??
      this.pickObject<TickerMessage>(payload, ['data']) ??
      this.pickObject<TickerMessage>(payload, ['payload']) ??
      (this.isTicker(payload) ? payload : null);

    return this.isTicker(candidate) ? candidate : null;
  }

  private parseOhlc(raw: string): OHLCMessage | null {
    const payload = JSON.parse(raw) as ExternalMessage<OHLCMessage>;
    const candidate =
      this.pickObject<OHLCMessage>(payload, ['candle']) ??
      this.pickObject<OHLCMessage>(payload, ['data']) ??
      this.pickObject<OHLCMessage>(payload, ['payload']) ??
      (this.isOhlc(payload) ? payload : null);

    return this.isOhlc(candidate) ? candidate : null;
  }

  private pickObject<T>(value: unknown, keys: string[]): T | null {
    if (!value || typeof value !== 'object') return null;
    for (const key of keys) {
      const candidate = (value as Record<string, unknown>)[key];
      if (candidate && typeof candidate === 'object') {
        return candidate as T;
      }
    }
    return null;
  }

  private isTicker(value: unknown): value is TickerMessage {
    if (!value || typeof value !== 'object') {
      return false;
    }

    const item = value as Record<string, unknown>;
    return [
      'pair_id',
      'symbol',
      'last_price',
      'bid',
      'ask',
      'volume_24h',
      'volume_24h_usd',
      'change_24h',
      'change_percent_24h',
      'high_24h',
      'low_24h',
      'open_24h',
      'timestamp',
    ].every((field) => item[field] !== undefined && item[field] !== null);
  }

  private isOhlc(value: unknown): value is OHLCMessage {
    if (!value || typeof value !== 'object') {
      return false;
    }

    const item = value as Record<string, unknown>;
    return [
      'pair_id',
      'interval',
      'open_time',
      'close_time',
      'open',
      'high',
      'low',
      'close',
      'volume',
      'quote_volume',
      'trades_count',
      'is_closed',
    ].every((field) => item[field] !== undefined && item[field] !== null);
  }
}
