import { describe, expect, it } from '@jest/globals';
import { resolveOhlcvLocale } from './ohlcv-locale.util';

describe('resolveOhlcvLocale', () => {
  it('prefers locale query over Accept-Language', () => {
    expect(resolveOhlcvLocale('vi-VN', 'en-US')).toBe('vi-VN');
  });

  it('uses first Accept-Language tag when query missing', () => {
    expect(resolveOhlcvLocale(undefined, 'vi;q=0.9, en;q=0.8')).toBe('vi');
  });

  it('normalizes underscore to hyphen in query', () => {
    expect(resolveOhlcvLocale('en_US', undefined)).toBe('en-US');
  });

  it('falls back to en when nothing usable', () => {
    expect(resolveOhlcvLocale(undefined, undefined)).toBe('en');
    expect(resolveOhlcvLocale('!!!', undefined)).toBe('en');
  });
});
