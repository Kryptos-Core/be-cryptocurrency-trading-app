import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import {
  MARKET_EVENTS,
  type OHLCMessage,
  type TickerMessage,
} from '../interfaces/websocket.interface';

export type PublicWsParityPairSample = {
  pairId: string;
  symbol: string;
  lastPriceDelta: string;
  bidDelta: string;
  askDelta: string;
  volume24hDelta: string;
  emittedAt: string;
  externalAt: string;
};

export type PublicWsPayloadContractReport = {
  source: string;
  checkedAt: string;
  ticker: {
    hasSample: boolean;
    contractValid: boolean;
    missingFields: string[];
  };
  ohlc: {
    hasSample: boolean;
    contractValid: boolean;
    missingFields: string[];
  };
  goAggregatorParity: {
    comparedPairs: number;
    driftPairs: number;
    topDrifts: PublicWsParityPairSample[];
  };
};

@Injectable()
export class PublicWsPayloadParityService {
  private readonly publicWsSource: string;

  private latestTicker: TickerMessage | null = null;
  private latestOhlc: OHLCMessage | null = null;

  private readonly latestExternalTickerByPair = new Map<string, TickerMessage>();
  private readonly latestEmittedTickerByPair = new Map<string, TickerMessage>();

  constructor(private readonly configService: ConfigService) {
    this.publicWsSource =
      (this.configService.get<string>('PUBLIC_WS_SOURCE') ?? 'nestjs').trim().toLowerCase();
  }

  @OnEvent(MARKET_EVENTS.PRICE_UPDATED)
  onTicker(ticker: TickerMessage): void {
    this.latestTicker = ticker;
    this.latestEmittedTickerByPair.set(String(ticker.pair_id), ticker);
  }

  @OnEvent(MARKET_EVENTS.CANDLE_UPDATED)
  onOhlc(candle: OHLCMessage): void {
    this.latestOhlc = candle;
  }

  recordExternalTicker(ticker: TickerMessage): void {
    this.latestExternalTickerByPair.set(String(ticker.pair_id), ticker);
  }

  getReport(): PublicWsPayloadContractReport {
    const tickerCheck = this.validateTicker(this.latestTicker);
    const ohlcCheck = this.validateOhlc(this.latestOhlc);
    const parity = this.buildGoAggregatorParity();

    return {
      source: this.publicWsSource,
      checkedAt: new Date().toISOString(),
      ticker: tickerCheck,
      ohlc: ohlcCheck,
      goAggregatorParity: parity,
    };
  }

  private validateTicker(
    payload: TickerMessage | null,
  ): { hasSample: boolean; contractValid: boolean; missingFields: string[] } {
    const requiredFields: Array<keyof TickerMessage> = [
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
    ];

    if (!payload) {
      return {
        hasSample: false,
        contractValid: false,
        missingFields: requiredFields.map((field) => String(field)),
      };
    }

    const missingFields = requiredFields
      .filter((field) => {
        const value = payload[field];
        return value === null || value === undefined || value === '';
      })
      .map((field) => String(field));

    return {
      hasSample: true,
      contractValid: missingFields.length === 0,
      missingFields,
    };
  }

  private validateOhlc(
    payload: OHLCMessage | null,
  ): { hasSample: boolean; contractValid: boolean; missingFields: string[] } {
    const requiredFields: Array<keyof OHLCMessage> = [
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
    ];

    if (!payload) {
      return {
        hasSample: false,
        contractValid: false,
        missingFields: requiredFields.map((field) => String(field)),
      };
    }

    const missingFields = requiredFields
      .filter((field) => {
        const value = payload[field];
        return value === null || value === undefined || value === '';
      })
      .map((field) => String(field));

    return {
      hasSample: true,
      contractValid: missingFields.length === 0,
      missingFields,
    };
  }

  private buildGoAggregatorParity(): {
    comparedPairs: number;
    driftPairs: number;
    topDrifts: PublicWsParityPairSample[];
  } {
    const drifts: PublicWsParityPairSample[] = [];

    for (const [pairId, externalTicker] of this.latestExternalTickerByPair.entries()) {
      const emittedTicker = this.latestEmittedTickerByPair.get(pairId);
      if (!emittedTicker) {
        continue;
      }

      const lastPriceDelta = this.absoluteDelta(externalTicker.last_price, emittedTicker.last_price);
      const bidDelta = this.absoluteDelta(externalTicker.bid, emittedTicker.bid);
      const askDelta = this.absoluteDelta(externalTicker.ask, emittedTicker.ask);
      const volume24hDelta = this.absoluteDelta(externalTicker.volume_24h, emittedTicker.volume_24h);

      const hasDrift =
        this.isNonZero(lastPriceDelta) ||
        this.isNonZero(bidDelta) ||
        this.isNonZero(askDelta) ||
        this.isNonZero(volume24hDelta);

      if (!hasDrift) {
        continue;
      }

      drifts.push({
        pairId,
        symbol: emittedTicker.symbol,
        lastPriceDelta,
        bidDelta,
        askDelta,
        volume24hDelta,
        emittedAt: emittedTicker.timestamp,
        externalAt: externalTicker.timestamp,
      });
    }

    const topDrifts = drifts
      .sort((a, b) => Number(b.lastPriceDelta) - Number(a.lastPriceDelta))
      .slice(0, 20);

    return {
      comparedPairs: this.latestExternalTickerByPair.size,
      driftPairs: drifts.length,
      topDrifts,
    };
  }

  private absoluteDelta(a: string, b: string): string {
    const left = Number(a);
    const right = Number(b);
    if (!Number.isFinite(left) || !Number.isFinite(right)) {
      return '0';
    }
    return String(Math.abs(left - right));
  }

  private isNonZero(value: string): boolean {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return false;
    }
    return numeric > 0;
  }
}
