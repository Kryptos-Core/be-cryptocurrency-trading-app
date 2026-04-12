import { computeMarketBuyMaxQuoteReserve } from './market-buy-reserve.util';

describe('computeMarketBuyMaxQuoteReserve', () => {
  it('returns amount * bestAsk * (1 + slippage) for whole numbers', () => {
    expect(computeMarketBuyMaxQuoteReserve('100', '1', '0.01')).toBe('101.000000000000000000');
  });

  it('handles fractional amount and price', () => {
    const r = computeMarketBuyMaxQuoteReserve('2000', '0.5', '0.01');
    expect(r).toBe('1010.000000000000000000');
  });

  it('handles zero slippage', () => {
    expect(computeMarketBuyMaxQuoteReserve('50', '2', '0')).toBe('100.000000000000000000');
  });
});
