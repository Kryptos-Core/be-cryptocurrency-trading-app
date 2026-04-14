import { BadRequestException } from '@nestjs/common';

/** All intervals accepted by the direct `interval` query parameter. */
export const VALID_INTERVALS = ['1m', '5m', '15m', '1h', '4h', '1d'] as const;
export type OhlcvInterval = (typeof VALID_INTERVALS)[number];

/** Default lookback when neither interval nor range is specified (7 days). */
const DEFAULT_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;

/** Lookback window (ms) for each direct interval. */
const INTERVAL_LOOKBACK_MS: Record<OhlcvInterval, number> = {
  '1m': 2 * 24 * 60 * 60 * 1000,
  '5m': 3 * 24 * 60 * 60 * 1000,
  '15m': 7 * 24 * 60 * 60 * 1000,
  '1h': 30 * 24 * 60 * 60 * 1000,
  '4h': 90 * 24 * 60 * 60 * 1000,
  '1d': 365 * 24 * 60 * 60 * 1000,
};

/** Legacy range → interval mapping (backward compat). */
const RANGE_INTERVAL: Record<string, OhlcvInterval> = {
  '1d': '1m',
  '1M': '1h',
  '3M': '4h',
  '1y': '1d',
  '5y': '1d',
};

/** Legacy range → lookback ms (mirrors MarketsService.RANGE_MS). */
const RANGE_MS: Record<string, number> = {
  '1d': 24 * 60 * 60 * 1000,
  '1M': 30 * 24 * 60 * 60 * 1000,
  '3M': 90 * 24 * 60 * 60 * 1000,
  '1y': 365 * 24 * 60 * 60 * 1000,
  '5y': 5 * 365 * 24 * 60 * 60 * 1000,
};

export interface OhlcvResolution {
  interval: OhlcvInterval;
  lookbackMs: number;
}

/**
 * Resolve OHLCV interval and lookback window from the incoming query params.
 *
 * Priority:
 * 1. Direct `interval` param (crypto-style: 1m/5m/15m/1h/4h/1d) — wins when present.
 * 2. Legacy `range` param (1d/1M/3M/1y/5y) — for backward compatibility.
 * 3. Default: 1h interval, 7-day lookback.
 *
 * Throws BadRequestException when an unknown value is passed for either param.
 */
export function resolveOhlcvInterval({
  interval,
  range,
}: {
  interval?: string;
  range?: string;
}): OhlcvResolution {
  if (interval !== undefined) {
    if (!VALID_INTERVALS.includes(interval as OhlcvInterval)) {
      throw new BadRequestException(
        `Invalid interval "${interval}". Supported: ${VALID_INTERVALS.join(', ')}`,
      );
    }
    const iv = interval as OhlcvInterval;
    return { interval: iv, lookbackMs: INTERVAL_LOOKBACK_MS[iv] };
  }

  if (range !== undefined) {
    const iv = RANGE_INTERVAL[range];
    if (!iv) {
      throw new BadRequestException(
        `Invalid range "${range}". Supported: ${Object.keys(RANGE_INTERVAL).join(', ')}`,
      );
    }
    return { interval: iv, lookbackMs: RANGE_MS[range] };
  }

  return { interval: '1h', lookbackMs: DEFAULT_LOOKBACK_MS };
}

/** Return the preset lookback ms for a valid direct interval. */
export function intervalLookbackMs(interval: OhlcvInterval): number {
  return INTERVAL_LOOKBACK_MS[interval];
}
