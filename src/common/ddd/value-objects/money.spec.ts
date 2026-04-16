import Decimal from 'decimal.js';
import { Money } from './money.vo';

describe('Money', () => {
  // ─── Construction ─────────────────────────────────────────────────────────

  it('should create a Money from string', () => {
    const m = Money.of('100.50', 'USDT');
    expect(m.amount).toBe('100.5');
    expect(m.currency).toBe('USDT');
  });

  it('should normalise currency to uppercase', () => {
    const m = Money.of('1', 'btc');
    expect(m.currency).toBe('BTC');
  });

  it('should create zero Money', () => {
    const m = Money.zero('BTC');
    expect(m.isZero()).toBe(true);
  });

  it('should throw on empty currency', () => {
    expect(() => Money.of('1', '')).toThrow();
    expect(() => Money.of('1', '  ')).toThrow();
  });

  // ─── Equality ─────────────────────────────────────────────────────────────

  it('should be equal when amount and currency match', () => {
    const m1 = Money.of('100', 'USDT');
    const m2 = Money.of('100', 'USDT');
    expect(m1.equals(m2)).toBe(true);
  });

  it('should not be equal when amounts differ', () => {
    const m1 = Money.of('100', 'USDT');
    const m2 = Money.of('200', 'USDT');
    expect(m1.equals(m2)).toBe(false);
  });

  it('should not be equal when currencies differ', () => {
    const m1 = Money.of('100', 'USDT');
    const m2 = Money.of('100', 'BTC');
    expect(m1.equals(m2)).toBe(false);
  });

  it('should return false when comparing to null', () => {
    const m = Money.of('100', 'USDT');
    expect(m.equals(null as any)).toBe(false);
  });

  // ─── Arithmetic ───────────────────────────────────────────────────────────

  it('should add two Money values of the same currency', () => {
    const result = Money.of('50', 'BTC').add(Money.of('30', 'BTC'));
    expect(result.amount).toBe('80');
    expect(result.currency).toBe('BTC');
  });

  it('should subtract two Money values', () => {
    const result = Money.of('100', 'USDT').subtract(Money.of('30', 'USDT'));
    expect(result.amount).toBe('70');
  });

  it('should multiply by a factor', () => {
    const result = Money.of('100', 'USDT').multiply('0.001');
    expect(result.amount).toBe('0.1');
  });

  it('should throw when adding different currencies', () => {
    const m1 = Money.of('100', 'BTC');
    const m2 = Money.of('100', 'USDT');
    expect(() => m1.add(m2)).toThrow();
  });

  // ─── Comparisons ──────────────────────────────────────────────────────────

  it('should detect positive amounts', () => {
    expect(Money.of('0.001', 'BTC').isPositive()).toBe(true);
    expect(Money.zero('BTC').isPositive()).toBe(false);
  });

  it('should detect negative amounts', () => {
    expect(Money.of('-1', 'BTC').isNegative()).toBe(true);
    expect(Money.of('1', 'BTC').isNegative()).toBe(false);
  });

  it('should compare greater/less than', () => {
    const a = Money.of('100', 'USDT');
    const b = Money.of('50', 'USDT');
    expect(a.isGreaterThan(b)).toBe(true);
    expect(b.isLessThan(a)).toBe(true);
    expect(a.isGreaterThanOrEqual(a)).toBe(true);
  });

  // ─── Decimal ──────────────────────────────────────────────────────────────

  it('should return a Decimal instance', () => {
    const m = Money.of('123.456', 'ETH');
    expect(m.toDecimal()).toBeInstanceOf(Decimal);
    expect(m.toDecimal().toFixed(3)).toBe('123.456');
  });

  // ─── toString ─────────────────────────────────────────────────────────────

  it('should have a human-readable toString', () => {
    expect(Money.of('50000', 'USDT').toString()).toBe('50000 USDT');
  });
});
