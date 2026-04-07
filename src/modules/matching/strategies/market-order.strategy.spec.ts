import { Test, TestingModule } from '@nestjs/testing';
import { MarketOrderStrategy } from './market-order.strategy';
import {
  MatchingContext,
  OrderBookOrder,
  TradeExecutionResult,
  TradeExecutor,
} from '../interfaces';

function order(overrides: Partial<OrderBookOrder> & { order_id: string }): OrderBookOrder {
  return {
    pair_id: 'pair-1',
    user_id: 'user-1',
    side: 'BUY',
    type: 'MARKET',
    price: null,
    amount: '1',
    filled_amount: '0',
    status: 'OPEN',
    created_at: new Date('2025-01-01T00:00:00.000Z'),
    remaining: '1',
    ...overrides,
    order_id: overrides.order_id,
  };
}

describe('MarketOrderStrategy', () => {
  let strategy: MarketOrderStrategy;
  const pairId = 'pair-1';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MarketOrderStrategy],
    }).compile();
    strategy = module.get(MarketOrderStrategy);
  });

  it('consumes available makers until taker filled', async () => {
    const m1 = order({ order_id: 'm1', side: 'SELL', price: '100', remaining: '0.5', user_id: 'user-2' });
    const m2 = order({ order_id: 'm2', side: 'SELL', price: '101', remaining: '1', user_id: 'user-2' });
    const orderBook = {
      peekBestMaker: jest
        .fn()
        .mockReturnValueOnce(m1)
        .mockReturnValueOnce(m2)
        .mockReturnValueOnce(null),
      popBestMaker: jest.fn().mockReturnValueOnce(m1).mockReturnValueOnce(m2),
      addOrder: jest.fn(),
    };

    const executeTrade = jest
      .fn()
      .mockResolvedValueOnce({
        trade_id: 't1',
        pair_id: pairId,
        maker_order_id: 'm1',
        taker_order_id: 'tk1',
        price: '100',
        amount: '0.5',
        taker_fee: '0',
        maker_fee: '0',
        fee_currency_id: 'quote-1',
        created_at: new Date(),
      } as TradeExecutionResult)
      .mockResolvedValueOnce({
        trade_id: 't2',
        pair_id: pairId,
        maker_order_id: 'm2',
        taker_order_id: 'tk1',
        price: '101',
        amount: '0.5',
        taker_fee: '0',
        maker_fee: '0',
        fee_currency_id: 'quote-1',
        created_at: new Date(),
      } as TradeExecutionResult);

    const context: MatchingContext = {
      pairId,
      takerOrder: order({ order_id: 'tk1', side: 'BUY', remaining: '1' }),
      feeCurrencyId: 'quote-1',
      makerFeeRate: '0',
      takerFeeRate: '0',
    };

    const results = await strategy.match(context, orderBook as any, executeTrade as TradeExecutor);
    expect(results).toHaveLength(2);
    expect(orderBook.addOrder).toHaveBeenCalledWith(
      expect.objectContaining({ order_id: 'm2', remaining: '0.5' }),
    );
  });

  it('restores maker and stops when executeTrade returns null', async () => {
    const maker = order({ order_id: 'm1', side: 'SELL', price: '100', remaining: '1', user_id: 'user-2' });
    const orderBook = {
      peekBestMaker: jest.fn().mockReturnValueOnce(maker).mockReturnValueOnce(null),
      popBestMaker: jest.fn().mockReturnValueOnce(maker),
      addOrder: jest.fn(),
    };

    const executeTrade = jest.fn().mockResolvedValue(null);
    const context: MatchingContext = {
      pairId,
      takerOrder: order({ order_id: 'tk1', side: 'BUY', remaining: '1' }),
      feeCurrencyId: 'quote-1',
      makerFeeRate: '0',
      takerFeeRate: '0',
    };

    const results = await strategy.match(context, orderBook as any, executeTrade as TradeExecutor);
    expect(results).toEqual([]);
    expect(orderBook.addOrder).toHaveBeenCalledWith(maker);
  });

  it('skips self-trade: does not match market order when maker has same user_id as taker', async () => {
    const maker = order({
      order_id: 'm-self',
      side: 'SELL',
      price: '100',
      remaining: '1',
      user_id: 'user-1', // same user
    });
    const orderBook = {
      peekBestMaker: jest.fn().mockReturnValueOnce(maker).mockReturnValueOnce(null),
      popBestMaker: jest.fn().mockReturnValueOnce(maker),
      addOrder: jest.fn(),
    };
    const executeTrade = jest.fn();
    const context: MatchingContext = {
      pairId,
      takerOrder: order({ order_id: 'tk-self', side: 'BUY', remaining: '1', user_id: 'user-1' }),
      feeCurrencyId: 'quote-1',
      makerFeeRate: '0',
      takerFeeRate: '0',
    };

    const results = await strategy.match(context, orderBook as any, executeTrade as TradeExecutor);
    expect(results).toEqual([]);
    // executeTrade must NOT be called — no fill
    expect(executeTrade).not.toHaveBeenCalled();
    // The maker was popped out (skipped, not traded)
    expect(orderBook.popBestMaker).toHaveBeenCalledWith(pairId, 'SELL');
    // The skipped maker must NOT be re-added to the book
    expect(orderBook.addOrder).not.toHaveBeenCalled();
  });

  it('computes fill amount exactly without floating-point error', async () => {
    // takerRemaining=0.3, 3 makers of 0.1 each → all 3 fills must complete, third call must pass '0.1'
    const m1 = order({ order_id: 'm-d1', side: 'SELL', price: '100', remaining: '0.1', user_id: 'user-2' });
    const m2 = order({ order_id: 'm-d2', side: 'SELL', price: '100', remaining: '0.1', user_id: 'user-2' });
    const m3 = order({ order_id: 'm-d3', side: 'SELL', price: '100', remaining: '0.1', user_id: 'user-2' });

    const makeResult = (id: string, mkId: string): TradeExecutionResult => ({
      trade_id: id,
      pair_id: pairId,
      maker_order_id: mkId,
      taker_order_id: 'tk-d',
      price: '100',
      amount: '0.1',
      taker_fee: '0',
      maker_fee: '0',
      fee_currency_id: 'quote-1',
      created_at: new Date(),
    });

    const orderBook = {
      peekBestMaker: jest.fn()
        .mockReturnValueOnce(m1).mockReturnValueOnce(m2).mockReturnValueOnce(m3).mockReturnValueOnce(null),
      popBestMaker: jest.fn().mockReturnValueOnce(m1).mockReturnValueOnce(m2).mockReturnValueOnce(m3),
      addOrder: jest.fn(),
    };
    const executeTrade = jest.fn()
      .mockResolvedValueOnce(makeResult('t1', 'm-d1'))
      .mockResolvedValueOnce(makeResult('t2', 'm-d2'))
      .mockResolvedValueOnce(makeResult('t3', 'm-d3'));

    const context: MatchingContext = {
      pairId,
      takerOrder: order({ order_id: 'tk-d', side: 'BUY', remaining: '0.3', user_id: 'user-1' }),
      feeCurrencyId: 'quote-1',
      makerFeeRate: '0',
      takerFeeRate: '0',
    };

    const results = await strategy.match(context, orderBook as any, executeTrade as TradeExecutor);
    // All 3 fills must happen
    expect(results).toHaveLength(3);
    // Third fill must pass exactly '0.1'
    expect(executeTrade.mock.calls[2][1]).toBe('0.1');
  });
});
