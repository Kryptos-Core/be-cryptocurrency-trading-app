import { OrderBookOrder } from '../interfaces';
import { marketOrderCanFullyFillRemaining } from './market-fok-fill.util';

function mk(overrides: Partial<OrderBookOrder> & { order_id: string }): OrderBookOrder {
  return {
    pair_id: 'p1',
    user_id: 'u2',
    side: 'SELL',
    type: 'LIMIT',
    price: '100',
    amount: '1',
    filled_amount: '0',
    status: 'OPEN',
    created_at: new Date(),
    remaining: '1',
    ...overrides,
    order_id: overrides.order_id,
  };
}

describe('marketOrderCanFullyFillRemaining', () => {
  const taker: OrderBookOrder = {
    order_id: 't1',
    pair_id: 'p1',
    user_id: 'u1',
    side: 'BUY',
    type: 'MARKET',
    price: null,
    amount: '1',
    filled_amount: '0',
    status: 'OPEN',
    created_at: new Date(),
    remaining: '1',
  };

  it('returns true when one maker covers size within slippage', () => {
    const makers = [mk({ order_id: 'm1', price: '100', remaining: '1' })];
    expect(marketOrderCanFullyFillRemaining(makers, taker, '0.05')).toBe(true);
  });

  it('returns false when second maker exceeds slippage before filling remainder', () => {
    const makers = [
      mk({ order_id: 'm1', price: '100', remaining: '0.5' }),
      mk({ order_id: 'm2', user_id: 'u3', price: '110', remaining: '0.5' }),
    ];
    expect(marketOrderCanFullyFillRemaining(makers, taker, '0.05')).toBe(false);
  });

  it('returns true without slippage when depth covers size', () => {
    const makers = [
      mk({ order_id: 'm1', price: '100', remaining: '0.5' }),
      mk({ order_id: 'm2', user_id: 'u3', price: '110', remaining: '0.5' }),
    ];
    expect(marketOrderCanFullyFillRemaining(makers, taker, undefined)).toBe(true);
  });
});
