import { Test, type TestingModule } from '@nestjs/testing';
import type {
  MatchingContext,
  OrderBookOrder,
  TradeExecutionResult,
  TradeExecutor,
} from '../interfaces';
import { PriceTimePriorityStrategy } from './price-time-priority.strategy';

function order(overrides: Partial<OrderBookOrder> & { order_id: string }): OrderBookOrder {
  return {
    pair_id: 'pair-1',
    user_id: 'user-1',
    side: 'BUY',
    type: 'LIMIT',
    price: '100',
    amount: '1',
    filled_amount: '0',
    status: 'OPEN',
    created_at: new Date('2025-01-01T00:00:00.000Z'),
    remaining: '1',
    ...overrides,
    order_id: overrides.order_id,
  };
}

describe('PriceTimePriorityStrategy', () => {
  let strategy: PriceTimePriorityStrategy;
  const pairId = 'pair-1';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PriceTimePriorityStrategy],
    }).compile();
    strategy = module.get(PriceTimePriorityStrategy);
  });

  it('matches BUY taker with SELL maker when price crosses', async () => {
    const maker = order({
      order_id: 'm1',
      side: 'SELL',
      price: '99',
      remaining: '1',
      user_id: 'user-2',
    });
    const orderBook = {
      peekBestMaker: jest.fn().mockReturnValueOnce(maker).mockReturnValueOnce(null),
      popBestMaker: jest.fn().mockReturnValueOnce(maker),
      addOrder: jest.fn(),
    };

    const tradeResult: TradeExecutionResult = {
      trade_id: 't1',
      pair_id: pairId,
      maker_order_id: 'm1',
      taker_order_id: 'tk1',
      price: '99',
      amount: '1',
      taker_fee: '0',
      maker_fee: '0',
      fee_currency_id: 'quote-1',
      created_at: new Date(),
    };

    const executeTrade = jest.fn().mockResolvedValue(tradeResult);
    const taker = order({ order_id: 'tk1', side: 'BUY', price: '100', remaining: '1' });
    const context: MatchingContext = {
      pairId,
      takerOrder: taker,
      feeCurrencyId: 'quote-1',
      makerFeeRate: '0.001',
      takerFeeRate: '0.001',
    };

    const results = await strategy.match(context, orderBook as any, executeTrade as TradeExecutor);
    expect(results).toHaveLength(1);
    expect(results[0].trade_id).toBe('t1');
    expect(executeTrade).toHaveBeenCalledWith(maker, '1.000000000000000000', '99');
  });

  it('does not match when price does not cross', async () => {
    const maker = order({
      order_id: 'm1',
      side: 'SELL',
      price: '101',
      remaining: '1',
      user_id: 'user-2',
    });
    const orderBook = {
      peekBestMaker: jest.fn().mockReturnValue(maker),
      popBestMaker: jest.fn(),
      addOrder: jest.fn(),
    };
    const executeTrade = jest.fn();
    const taker = order({ order_id: 'tk1', side: 'BUY', price: '100', remaining: '1' });
    const context: MatchingContext = {
      pairId,
      takerOrder: taker,
      feeCurrencyId: 'quote-1',
      makerFeeRate: '0.001',
      takerFeeRate: '0.001',
    };

    const results = await strategy.match(context, orderBook as any, executeTrade as TradeExecutor);
    expect(results).toEqual([]);
    expect(executeTrade).not.toHaveBeenCalled();
  });

  it('restores maker and stops when executeTrade returns null', async () => {
    const maker = order({
      order_id: 'm1',
      side: 'SELL',
      price: '100',
      remaining: '1',
      user_id: 'user-2',
    });
    const orderBook = {
      peekBestMaker: jest.fn().mockReturnValueOnce(maker).mockReturnValueOnce(null),
      popBestMaker: jest.fn().mockReturnValueOnce(maker),
      addOrder: jest.fn(),
    };

    const executeTrade = jest.fn().mockResolvedValue(null);
    const taker = order({ order_id: 'tk1', side: 'BUY', price: '100', remaining: '1' });
    const context: MatchingContext = {
      pairId,
      takerOrder: taker,
      feeCurrencyId: 'quote-1',
      makerFeeRate: '0',
      takerFeeRate: '0',
    };

    const results = await strategy.match(context, orderBook as any, executeTrade as TradeExecutor);
    expect(results).toEqual([]);
    expect(orderBook.addOrder).toHaveBeenCalledWith(maker);
  });

  it('skips self-trade: does not match when taker and maker have the same user_id', async () => {
    // Same user on both sides → self-trade, must be prevented
    const maker = order({
      order_id: 'm-self',
      side: 'SELL',
      price: '99',
      remaining: '1',
      user_id: 'user-1', // same user as taker
    });
    const orderBook = {
      peekBestMaker: jest.fn().mockReturnValueOnce(maker).mockReturnValueOnce(null),
      popBestMaker: jest.fn().mockReturnValueOnce(maker),
      addOrder: jest.fn(),
    };
    const executeTrade = jest.fn();
    const taker = order({
      order_id: 'tk-self',
      side: 'BUY',
      price: '100',
      remaining: '1',
      user_id: 'user-1',
    });
    const context: MatchingContext = {
      pairId,
      takerOrder: taker,
      feeCurrencyId: 'quote-1',
      makerFeeRate: '0.001',
      takerFeeRate: '0.001',
    };

    const results = await strategy.match(context, orderBook as any, executeTrade as TradeExecutor);
    expect(results).toEqual([]);
    // executeTrade must NOT be called — no actual fill happens
    expect(executeTrade).not.toHaveBeenCalled();
    // The self-trade maker was popped (removed from book) rather than traded
    expect(orderBook.popBestMaker).toHaveBeenCalledWith(pairId, 'SELL');
    // The skipped maker must NOT be re-added to the book
    expect(orderBook.addOrder).not.toHaveBeenCalled();
  });

  it('matches cross-user trades correctly (non-self-trade is unaffected)', async () => {
    const maker = order({
      order_id: 'm-other',
      side: 'SELL',
      price: '99',
      remaining: '1',
      user_id: 'user-2', // different user
    });
    const tradeResult: TradeExecutionResult = {
      trade_id: 't-ok',
      pair_id: pairId,
      maker_order_id: 'm-other',
      taker_order_id: 'tk-other',
      price: '99',
      amount: '1',
      taker_fee: '0',
      maker_fee: '0',
      fee_currency_id: 'quote-1',
      created_at: new Date(),
    };
    const orderBook = {
      peekBestMaker: jest.fn().mockReturnValueOnce(maker).mockReturnValueOnce(null),
      popBestMaker: jest.fn().mockReturnValueOnce(maker),
      addOrder: jest.fn(),
    };
    const executeTrade = jest.fn().mockResolvedValue(tradeResult);
    const taker = order({
      order_id: 'tk-other',
      side: 'BUY',
      price: '100',
      remaining: '1',
      user_id: 'user-1',
    });
    const context: MatchingContext = {
      pairId,
      takerOrder: taker,
      feeCurrencyId: 'quote-1',
      makerFeeRate: '0.001',
      takerFeeRate: '0.001',
    };

    const results = await strategy.match(context, orderBook as any, executeTrade as TradeExecutor);
    expect(results).toHaveLength(1);
    expect(results[0].trade_id).toBe('t-ok');
  });

  it('computes fill amount exactly without floating-point error (0.1 + 0.2 precision)', async () => {
    // Classic float trap: 0.3 - 0.1 - 0.1 = 0.09999999999999998 in IEEE 754, not 0.1
    // When taker fills 0.1 twice, the third fill should be exactly '0.1', not '0.09999...'
    const m1 = order({
      order_id: 'm-dec-1',
      side: 'SELL',
      price: '1',
      remaining: '0.1',
      user_id: 'user-2',
    });
    const m2 = order({
      order_id: 'm-dec-2',
      side: 'SELL',
      price: '1',
      remaining: '0.1',
      user_id: 'user-2',
    });
    const m3 = order({
      order_id: 'm-dec-3',
      side: 'SELL',
      price: '1',
      remaining: '0.1',
      user_id: 'user-2',
    });

    const makeTradeResult = (
      id: string,
      makerId: string,
      amount: string,
    ): TradeExecutionResult => ({
      trade_id: id,
      pair_id: pairId,
      maker_order_id: makerId,
      taker_order_id: 'tk-dec',
      price: '1',
      amount,
      taker_fee: '0',
      maker_fee: '0',
      fee_currency_id: 'quote-1',
      created_at: new Date(),
    });

    const orderBook = {
      peekBestMaker: jest
        .fn()
        .mockReturnValueOnce(m1)
        .mockReturnValueOnce(m2)
        .mockReturnValueOnce(m3)
        .mockReturnValueOnce(null),
      popBestMaker: jest
        .fn()
        .mockReturnValueOnce(m1)
        .mockReturnValueOnce(m2)
        .mockReturnValueOnce(m3),
      addOrder: jest.fn(),
    };
    const executeTrade = jest
      .fn()
      .mockResolvedValueOnce(makeTradeResult('t1', 'm-dec-1', '0.1'))
      .mockResolvedValueOnce(makeTradeResult('t2', 'm-dec-2', '0.1'))
      .mockResolvedValueOnce(makeTradeResult('t3', 'm-dec-3', '0.1'));

    const taker = order({
      order_id: 'tk-dec',
      side: 'BUY',
      price: '2',
      remaining: '0.3',
      user_id: 'user-1',
    });
    const context: MatchingContext = {
      pairId,
      takerOrder: taker,
      feeCurrencyId: 'quote-1',
      makerFeeRate: '0',
      takerFeeRate: '0',
    };

    const results = await strategy.match(context, orderBook as any, executeTrade as TradeExecutor);

    // All 3 fills must happen (if float error, 3rd fill gets skipped because remaining < 0.1)
    expect(results).toHaveLength(3);
    // Third fill must pass exactly '0.100000000000000000' (full 18-decimal precision)
    const thirdCall = executeTrade.mock.calls[2];
    expect(thirdCall[1]).toBe('0.100000000000000000');
  });
});
