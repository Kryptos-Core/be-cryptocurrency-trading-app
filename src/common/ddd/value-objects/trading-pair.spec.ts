import { TradingPair } from './trading-pair.vo';

describe('TradingPair', () => {
  it('should create from base and quote', () => {
    const pair = TradingPair.of('BTC', 'USDT');
    expect(pair.baseCurrency).toBe('BTC');
    expect(pair.quoteCurrency).toBe('USDT');
    expect(pair.symbol).toBe('BTC/USDT');
  });

  it('should normalise to uppercase', () => {
    const pair = TradingPair.of('eth', 'usdt');
    expect(pair.symbol).toBe('ETH/USDT');
  });

  it('should parse from symbol string', () => {
    const pair = TradingPair.fromSymbol('SOL/USDT');
    expect(pair.baseCurrency).toBe('SOL');
    expect(pair.quoteCurrency).toBe('USDT');
  });

  it('should throw on invalid symbol format', () => {
    expect(() => TradingPair.fromSymbol('BTCUSDT')).toThrow();
    expect(() => TradingPair.fromSymbol('BTC/USDT/USD')).toThrow();
  });

  it('should throw when base equals quote', () => {
    expect(() => TradingPair.of('USDT', 'USDT')).toThrow();
  });

  it('should throw on empty base or quote', () => {
    expect(() => TradingPair.of('', 'USDT')).toThrow();
    expect(() => TradingPair.of('BTC', '')).toThrow();
  });

  it('should be equal to another pair with same base and quote', () => {
    const p1 = TradingPair.of('BTC', 'USDT');
    const p2 = TradingPair.of('btc', 'usdt');
    expect(p1.equals(p2)).toBe(true);
  });

  it('should not be equal to a different pair', () => {
    const p1 = TradingPair.of('BTC', 'USDT');
    const p2 = TradingPair.of('ETH', 'USDT');
    expect(p1.equals(p2)).toBe(false);
  });

  it('should return false when comparing to null', () => {
    const p = TradingPair.of('BTC', 'USDT');
    expect(p.equals(null as any)).toBe(false);
  });

  it('toString returns the symbol', () => {
    expect(TradingPair.of('BTC', 'USDT').toString()).toBe('BTC/USDT');
  });
});
