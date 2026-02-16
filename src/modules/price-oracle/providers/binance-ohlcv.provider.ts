import { Injectable } from '@nestjs/common';
import { IOHLCVProvider, OHLCVCandleDto } from '../interfaces/ohlcv-provider.interface';

/** Binance Spot klines interval symbols. */
const INTERVAL_TO_BINANCE: Record<number, string> = {
  60: '1m',
  180: '3m',
  300: '5m',
  900: '15m',
  1800: '30m',
  3600: '1h',
  7200: '2h',
  14400: '4h',
  21600: '6h',
  43200: '12h',
  86400: '1d',
  604800: '1w',
};

const BINANCE_KLINES_URL = 'https://api.binance.com/api/v3/klines';

/**
 * Binance Spot OHLCV provider (on-demand by time range).
 * Fetches from GET /api/v3/klines?symbol=&interval=&startTime=&endTime=&limit=
 * No DB write; every request is a fresh API call.
 */
@Injectable()
export class BinanceOHLCVProvider implements IOHLCVProvider {
  readonly name = 'binance';

  async getOHLCVByRange(
    pairId: string,
    symbol: string,
    intervalSec: number,
    fromDate: Date,
    toDate: Date,
    limit: number,
  ): Promise<OHLCVCandleDto[]> {
    const binanceInterval = INTERVAL_TO_BINANCE[intervalSec];
    if (!binanceInterval) {
      return [];
    }
    const normalized = String(symbol).toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!normalized) return [];

    const startTime = fromDate.getTime();
    const endTime = toDate.getTime();
    const params = new URLSearchParams({
      symbol: normalized,
      interval: binanceInterval,
      startTime: String(startTime),
      endTime: String(endTime),
      limit: String(Math.min(limit, 1000)),
    });

    try {
      const res = await fetch(`${BINANCE_KLINES_URL}?${params}`);
      if (!res.ok) return [];
      const raw = await res.json();
      const rows = Array.isArray(raw) ? raw : [];
      if (rows.length === 0) return [];

      return rows.map((row: unknown) => {
        const r = Array.isArray(row) ? row : [];
        return {
          pair_id: pairId,
          interval_sec: intervalSec,
          open_time: new Date(Number(r[0])),
          open: String(r[1] ?? 0),
          high: String(r[2] ?? 0),
          low: String(r[3] ?? 0),
          close: String(r[4] ?? 0),
          volume: String(r[5] ?? 0),
        };
      });
    } catch {
      return [];
    }
  }
}
