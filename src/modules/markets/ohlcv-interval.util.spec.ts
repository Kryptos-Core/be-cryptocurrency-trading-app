import { describe, expect, it } from '@jest/globals';
import {
  resolveOhlcvInterval,
  intervalLookbackMs,
  VALID_INTERVALS,
} from './ohlcv-interval.util';
import { BadRequestException } from '@nestjs/common';

describe('resolveOhlcvInterval', () => {
  describe('direct interval mode (interval param takes priority)', () => {
    it('returns 1m interval with 2-day lookback', () => {
      const result = resolveOhlcvInterval({ interval: '1m' });
      expect(result.interval).toBe('1m');
      expect(result.lookbackMs).toBe(2 * 24 * 60 * 60 * 1000);
    });

    it('returns 5m interval with 3-day lookback', () => {
      const result = resolveOhlcvInterval({ interval: '5m' });
      expect(result.interval).toBe('5m');
      expect(result.lookbackMs).toBe(3 * 24 * 60 * 60 * 1000);
    });

    it('returns 15m interval with 7-day lookback', () => {
      const result = resolveOhlcvInterval({ interval: '15m' });
      expect(result.interval).toBe('15m');
      expect(result.lookbackMs).toBe(7 * 24 * 60 * 60 * 1000);
    });

    it('returns 1h interval with 30-day lookback', () => {
      const result = resolveOhlcvInterval({ interval: '1h' });
      expect(result.interval).toBe('1h');
      expect(result.lookbackMs).toBe(30 * 24 * 60 * 60 * 1000);
    });

    it('returns 4h interval with 90-day lookback', () => {
      const result = resolveOhlcvInterval({ interval: '4h' });
      expect(result.interval).toBe('4h');
      expect(result.lookbackMs).toBe(90 * 24 * 60 * 60 * 1000);
    });

    it('returns 1d interval with 365-day lookback', () => {
      const result = resolveOhlcvInterval({ interval: '1d' });
      expect(result.interval).toBe('1d');
      expect(result.lookbackMs).toBe(365 * 24 * 60 * 60 * 1000);
    });

    it('throws BadRequestException for unknown interval', () => {
      expect(() => resolveOhlcvInterval({ interval: '2h' })).toThrow(
        BadRequestException,
      );
      expect(() => resolveOhlcvInterval({ interval: '2h' })).toThrow(
        /Invalid interval/,
      );
    });

    it('throws BadRequestException listing supported intervals in message', () => {
      try {
        resolveOhlcvInterval({ interval: 'bad' });
      } catch (err) {
        expect(err).toBeInstanceOf(BadRequestException);
        const msg = (err as BadRequestException).message;
        VALID_INTERVALS.forEach((v) => expect(msg).toContain(v));
      }
    });

    it('interval param takes priority over range when both are supplied', () => {
      const result = resolveOhlcvInterval({ interval: '5m', range: '1y' });
      expect(result.interval).toBe('5m');
      expect(result.lookbackMs).toBe(3 * 24 * 60 * 60 * 1000);
    });
  });

  describe('legacy range mode (backward compatibility)', () => {
    it('returns 1m interval with 1-day lookback for range 1d', () => {
      const result = resolveOhlcvInterval({ range: '1d' });
      expect(result.interval).toBe('1m');
      expect(result.lookbackMs).toBe(24 * 60 * 60 * 1000);
    });

    it('returns 1h interval with 30-day lookback for range 1M', () => {
      const result = resolveOhlcvInterval({ range: '1M' });
      expect(result.interval).toBe('1h');
      expect(result.lookbackMs).toBe(30 * 24 * 60 * 60 * 1000);
    });

    it('returns 4h interval for range 3M', () => {
      const result = resolveOhlcvInterval({ range: '3M' });
      expect(result.interval).toBe('4h');
      expect(result.lookbackMs).toBe(90 * 24 * 60 * 60 * 1000);
    });

    it('returns 1d interval for range 1y', () => {
      const result = resolveOhlcvInterval({ range: '1y' });
      expect(result.interval).toBe('1d');
      expect(result.lookbackMs).toBe(365 * 24 * 60 * 60 * 1000);
    });

    it('returns 1d interval for range 5y', () => {
      const result = resolveOhlcvInterval({ range: '5y' });
      expect(result.interval).toBe('1d');
      expect(result.lookbackMs).toBe(5 * 365 * 24 * 60 * 60 * 1000);
    });

    it('throws BadRequestException for invalid range', () => {
      expect(() => resolveOhlcvInterval({ range: 'invalid' })).toThrow(
        BadRequestException,
      );
    });
  });

  describe('default mode (no interval, no range)', () => {
    it('defaults to 1h interval with 7-day lookback', () => {
      const result = resolveOhlcvInterval({});
      expect(result.interval).toBe('1h');
      expect(result.lookbackMs).toBe(7 * 24 * 60 * 60 * 1000);
    });
  });
});

describe('intervalLookbackMs', () => {
  it('maps each valid interval to a positive lookback in milliseconds', () => {
    VALID_INTERVALS.forEach((interval) => {
      const ms = intervalLookbackMs(interval);
      expect(ms).toBeGreaterThan(0);
    });
  });
});
