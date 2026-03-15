import { Test, TestingModule } from '@nestjs/testing';
import { PriceTimePriorityStrategy } from './price-time-priority.strategy';
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
    const maker = order({ order_id: 'm1', side: 'SELL', price: '99', remaining: '1' });
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
    expect(executeTrade).toHaveBeenCalledWith(maker, '1', '99');
  });

  it('does not match when price does not cross', async () => {
    const maker = order({ order_id: 'm1', side: 'SELL', price: '101', remaining: '1' });
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
    const maker = order({ order_id: 'm1', side: 'SELL', price: '100', remaining: '1' });
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
});
