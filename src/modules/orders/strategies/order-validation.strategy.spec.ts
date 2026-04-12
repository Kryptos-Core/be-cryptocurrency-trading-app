import { BusinessException, ValidationException } from '@/common/exceptions';
import { OrderValidationStrategy } from './order-validation.strategy';

describe('OrderValidationStrategy', () => {
  const strategy = new OrderValidationStrategy();

  const baseCtx = {
    pairId: 'p1',
    side: 'BUY' as const,
    type: 'LIMIT' as const,
    amount: '1',
    price: '100',
    minOrderAmount: '0.0001',
    availableBalance: '1000',
    amountScale: 18,
    priceScale: 18,
  };

  it('uses requiredQuoteForBuy for BUY when provided', () => {
    expect(() =>
      strategy.validate({
        ...baseCtx,
        requiredQuoteForBuy: '250',
        availableBalance: '200',
      }),
    ).toThrow(BusinessException);
  });

  it('passes BUY when available covers requiredQuoteForBuy', () => {
    expect(() =>
      strategy.validate({
        ...baseCtx,
        requiredQuoteForBuy: '250',
        availableBalance: '300',
      }),
    ).not.toThrow();
  });

  it('rejects invalid requiredQuoteForBuy', () => {
    expect(() =>
      strategy.validate({
        ...baseCtx,
        requiredQuoteForBuy: 'not-a-number',
        availableBalance: '300',
      }),
    ).toThrow(ValidationException);
  });
});
