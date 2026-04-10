/**
 * OHLCV candle row as returned by providers (on-demand, time-range APIs).
 * No persistence: APIs support start/end time; we fetch when needed.
 */
export interface OHLCVCandleDto {
  pair_id: string;
  interval_sec: number;
  open_time: Date;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
}

/**
 * Oracle interface for OHLCV data by time range.
 * Strategy pattern: Binance or other providers implement this.
 * Single Responsibility: one way to get historical candles.
 */
export interface IOHLCVProvider {
  readonly name: string;

  /**
   * Fetch OHLCV candles for a pair in the given time range.
   * @param pairId - Internal pair id (for response shape)
   * @param symbol - Trading symbol (e.g. BTCUSDT)
   * @param intervalSec - Candle interval in seconds (60, 300, 900, 3600, 86400, ...)
   * @param fromDate - Start of range (inclusive)
   * @param toDate - End of range (inclusive)
   * @param limit - Max candles to return
   */
  getOHLCVByRange(
    pairId: string,
    symbol: string,
    intervalSec: number,
    fromDate: Date,
    toDate: Date,
    limit: number,
  ): Promise<OHLCVCandleDto[]>;
}
