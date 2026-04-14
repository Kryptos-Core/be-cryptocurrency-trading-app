import { BusinessException } from '@/common/exceptions';
import { OrderReservePolicy } from '@/modules/orders/domain/services/order-reserve-policy.service';

describe('OrderReservePolicy', () => {
  const policy = new OrderReservePolicy();
  const pair = {
    min_order_amount: '0.0001',
    amount_scale: 8,
    price_scale: 2,
  };

  it('requires slippage tolerance for market buy', () => {
    expect(() =>
      policy.prepare({
        dto: {
          pairId: 'p1',
          side: 'BUY',
          type: 'MARKET',
          amount: '1',
        } as any,
        pair,
        availableQuote: '1000',
        availableBase: '0',
        bestLimitSellPrice: '100',
      }),
    ).toThrow(BusinessException);
  });

  it('computes reserved quote for market buy', () => {
    const result = policy.prepare({
      dto: {
        pairId: 'p1',
        side: 'BUY',
        type: 'MARKET',
        amount: '2',
        slippageTolerance: '0.05',
      } as any,
      pair,
      availableQuote: '1000',
      availableBase: '0',
      bestLimitSellPrice: '100',
    });

    expect(result.slippageTolerance).toBe('0.05');
    expect(result.marketBuyReservedQuote).toBe('210.000000000000000000');
    expect(result.validationContext.requiredQuoteForBuy).toBe('210.000000000000000000');
    expect(result.validationContext.availableBalance).toBe('1000');
  });

  it('uses base balance for sell validation context', () => {
    const result = policy.prepare({
      dto: {
        pairId: 'p1',
        side: 'SELL',
        type: 'LIMIT',
        amount: '2',
        price: '100',
      } as any,
      pair,
      availableQuote: '1000',
      availableBase: '3',
    });

    expect(result.validationContext.availableBalance).toBe('3');
    expect(result.marketBuyReservedQuote).toBeNull();
  });
});

