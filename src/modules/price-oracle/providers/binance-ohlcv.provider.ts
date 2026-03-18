import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '@/common/services';
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

/** TTL for completed (immutable) candles in Redis: 7 days. */
const COMPLETED_CANDLE_TTL_SEC = 7 * 24 * 3600;

/** Minimum cache fill ratio before serving from Redis (avoids stale partial data). */
const CACHE_HIT_RATIO = 0.9;

/**
 * Binance Spot OHLCV provider (on-demand by time range).
 *
 * Caching strategy (Redis ZSET):
 *   - Key: `ohlcv:{SYMBOL}:{binanceInterval}` (e.g. `ohlcv:BTCUSDT:1m`)
 *   - Score: openTime in milliseconds → enables ZRANGEBYSCORE range queries
 *   - Completed candles (openTime + intervalMs ≤ now) are immutable — cached 7 days
 *   - The current in-progress candle is always fetched fresh from Binance
 *   - On cache hit for completed range: only 1 Binance call for the current candle
 *   - On cache miss: full Binance fetch, completed candles written to Redis via pipeline
 */
@Injectable()
export class BinanceOHLCVProvider implements IOHLCVProvider {
  private readonly logger = new Logger(BinanceOHLCVProvider.name);
  readonly name = 'binance';

  constructor(private readonly redisService: RedisService) {}

  async getOHLCVByRange(
    pairId: string,
    symbol: string,
    intervalSec: number,
    fromDate: Date,
    toDate: Date,
    limit: number,
  ): Promise<OHLCVCandleDto[]> {
    const binanceInterval = INTERVAL_TO_BINANCE[intervalSec];
    if (!binanceInterval) return [];

    const normalized = String(symbol).toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!normalized) return [];

    const startMs = fromDate.getTime();
    const endMs = toDate.getTime();
    const intervalMs = intervalSec * 1000;
    const nowMs = Date.now();

    // openTime of the current (still open) candle
    const currentOpenTimeMs = Math.floor(nowMs / intervalMs) * intervalMs;

    const redisKey = `ohlcv:${normalized}:${binanceInterval}`;

    // --- Try Redis cache for completed candles in the requested range ---
    const completedRangeEnd = Math.min(endMs, currentOpenTimeMs - 1);
    if (completedRangeEnd >= startMs) {
      try {
        const cached = await this.queryRedisRange(redisKey, pairId, intervalSec, startMs, completedRangeEnd);
        const expectedCompleted = Math.floor((completedRangeEnd - startMs) / intervalMs) + 1;

        if (cached.length >= Math.floor(expectedCompleted * CACHE_HIT_RATIO)) {
          // Cache HIT for completed candles — only fetch current candle if needed
          if (endMs >= currentOpenTimeMs) {
            const current = await this.fetchFromBinance(
              pairId, normalized, binanceInterval, intervalSec,
              currentOpenTimeMs, endMs, 2,
            );
            return [...cached, ...current].slice(-limit);
          }
          return cached.slice(-limit);
        }
      } catch (err) {
        this.logger.warn(`Redis OHLCV cache read error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // --- Cache MISS: full fetch from Binance ---
    const candles = await this.fetchFromBinance(
      pairId, normalized, binanceInterval, intervalSec, startMs, endMs, limit,
    );

    // Persist completed candles to Redis asynchronously (fire-and-forget)
    if (candles.length > 0) {
      this.persistCompletedCandles(redisKey, candles, intervalMs, nowMs).catch((err) => {
        this.logger.warn(`Redis OHLCV cache write error: ${err instanceof Error ? err.message : String(err)}`);
      });
    }

    return candles;
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private async fetchFromBinance(
    pairId: string,
    normalized: string,
    binanceInterval: string,
    intervalSec: number,
    startMs: number,
    endMs: number,
    limit: number,
  ): Promise<OHLCVCandleDto[]> {
    const params = new URLSearchParams({
      symbol: normalized,
      interval: binanceInterval,
      startTime: String(startMs),
      endTime: String(endMs),
      limit: String(Math.min(limit, 1000)),
    });

    try {
      const res = await fetch(`${BINANCE_KLINES_URL}?${params}`);
      if (!res.ok) return [];
      const raw = await res.json();
      const rows = Array.isArray(raw) ? raw : [];
      return rows.map((row: unknown) => this.mapRow(row, pairId, intervalSec));
    } catch {
      return [];
    }
  }

  private mapRow(row: unknown, pairId: string, intervalSec: number): OHLCVCandleDto {
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
  }

  /**
   * Query Redis ZSET for candles in [startMs, endMs] and deserialize.
   */
  private async queryRedisRange(
    redisKey: string,
    pairId: string,
    intervalSec: number,
    startMs: number,
    endMs: number,
  ): Promise<OHLCVCandleDto[]> {
    const client = this.redisService.getClient();
    const members = await client.zrangebyscore(redisKey, startMs, endMs);
    return members.map((m) => {
      try {
        const parsed = JSON.parse(m) as Record<string, unknown>;
        return {
          pair_id: pairId,
          interval_sec: intervalSec,
          open_time: new Date(parsed.open_time as string | number),
          open: String(parsed.open ?? 0),
          high: String(parsed.high ?? 0),
          low: String(parsed.low ?? 0),
          close: String(parsed.close ?? 0),
          volume: String(parsed.volume ?? 0),
        };
      } catch {
        return null;
      }
    }).filter((c): c is OHLCVCandleDto => c !== null);
  }

  /**
   * Write completed (immutable) candles to Redis ZSET using a pipeline.
   * Score = openTime in ms for efficient range queries.
   * ZSET key TTL refreshed to 7 days on every write.
   */
  private async persistCompletedCandles(
    redisKey: string,
    candles: OHLCVCandleDto[],
    intervalMs: number,
    nowMs: number,
  ): Promise<void> {
    const client = this.redisService.getClient();
    const pipeline = client.pipeline();
    let hasCompleted = false;

    for (const candle of candles) {
      const openTimeMs = candle.open_time.getTime();
      const isCompleted = openTimeMs + intervalMs <= nowMs;
      if (!isCompleted) continue;

      hasCompleted = true;
      const score = openTimeMs;
      const member = JSON.stringify({
        open_time: openTimeMs,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume,
      });
      pipeline.zadd(redisKey, score, member);
    }

    if (hasCompleted) {
      pipeline.expire(redisKey, COMPLETED_CANDLE_TTL_SEC);
      await pipeline.exec();
    }
  }
}
