import { Test, TestingModule } from '@nestjs/testing';
import { PriceTimePriorityStrategy } from './price-time-priority.strategy';
import {
  MatchingContext,
  OrderBookOrder,
  TradeExecutionResult,
  TradeExecutor,
} from '../interfaces';

function order(overrides: Partial<OrderBookOrder> & { order_id: number }): OrderBookOrder {
  return {
    pair_id: 1,
    user_id: 1,
    side: 'BUY',
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

describe('PriceTimePriorityStrategy', () => {
  let strategy: PriceTimePriorityStrategy;
  const pairId = 1;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PriceTimePriorityStrategy],
    }).compile();
    strategy = module.get(PriceTimePriorityStrategy);
  });

  it('should be defined', () => {
    expect(strategy).toBeDefined();
  });

  it('returns empty when no maker on opposite side', async () => {
    const orderBook = {
      peekBestMaker: jest.fn().mockReturnValue(null),
      popBestMaker: jest.fn(),
      addOrder: jest.fn(),
    };
    const executeTrade = jest.fn();
    const taker = order({ order_id: 100, side: 'BUY', price: '100', remaining: '1' });
    const context: MatchingContext = {
      pairId,
      takerOrder: taker,
      feeCurrencyId: 2,
      makerFeeRate: '0.001',
      takerFeeRate: '0.001',
    };
    const results = await strategy.match(context, orderBook as any, executeTrade as TradeExecutor);
    expect(results).toEqual([]);
    expect(orderBook.peekBestMaker).toHaveBeenCalledWith(pairId, 'SELL');
    expect(executeTrade).not.toHaveBeenCalled();
  });

  it('matches BUY taker with SELL maker when maker price <= taker price', async () => {
    const maker = order({ order_id: 1, side: 'SELL', price: '99', remaining: '1' });
    const orderBook = {
      peekBestMaker: jest.fn().mockReturnValueOnce(maker).mockReturnValueOnce(null),
      popBestMaker: jest.fn().mockReturnValueOnce(maker),
      addOrder: jest.fn(),
    };
    const tradeResult: TradeExecutionResult = {
      trade_id: 1,
      pair_id: pairId,
      maker_order_id: 1,
      taker_order_id: 100,
      price: '99',
      amount: '1',
      taker_fee: '0',
      maker_fee: '0',
      fee_currency_id: 2,
      created_at: new Date(),
    };
    const executeTrade = jest.fn().mockResolvedValue(tradeResult);
    const taker = order({ order_id: 100, side: 'BUY', price: '100', remaining: '1' });
    const context: MatchingContext = {
      pairId,
      takerOrder: taker,
      feeCurrencyId: 2,
      makerFeeRate: '0.001',
      takerFeeRate: '0.001',
    };
    const results = await strategy.match(context, orderBook as any, executeTrade as TradeExecutor);
    expect(results).toHaveLength(1);
    expect(results[0].amount).toBe('1');
    expect(results[0].price).toBe('99');
    expect(executeTrade).toHaveBeenCalledWith(maker, '1', '99');
    expect(orderBook.addOrder).not.toHaveBeenCalled();
  });

  it('does not match BUY taker when best ask > taker price', async () => {
    const maker = order({ order_id: 1, side: 'SELL', price: '101', remaining: '1' });
    const orderBook = {
      peekBestMaker: jest.fn().mockReturnValue(maker),
      popBestMaker: jest.fn(),
      addOrder: jest.fn(),
    };
    const executeTrade = jest.fn();
    const taker = order({ order_id: 100, side: 'BUY', price: '100', remaining: '1' });
    const context: MatchingContext = {
      pairId,
      takerOrder: taker,
      feeCurrencyId: 2,
      makerFeeRate: '0.001',
      takerFeeRate: '0.001',
    };
    const results = await strategy.match(context, orderBook as any, executeTrade as TradeExecutor);
    expect(results).toEqual([]);
    expect(executeTrade).not.toHaveBeenCalled();
  });

  it('does not match SELL taker when best bid < taker price', async () => {
    const maker = order({ order_id: 1, side: 'BUY', price: '99', remaining: '1' });
    const orderBook = {
      peekBestMaker: jest.fn().mockReturnValue(maker),
      popBestMaker: jest.fn(),
      addOrder: jest.fn(),
    };
    const executeTrade = jest.fn();
    const taker = order({ order_id: 100, side: 'SELL', price: '100', remaining: '1' });
    const context: MatchingContext = {
      pairId,
      takerOrder: taker,
      feeCurrencyId: 2,
      makerFeeRate: '0.001',
      takerFeeRate: '0.001',
    };
    const results = await strategy.match(context, orderBook as any, executeTrade as TradeExecutor);
    expect(results).toEqual([]);
    expect(executeTrade).not.toHaveBeenCalled();
  });

  it('partial fill puts maker back with reduced remaining', async () => {
    const maker = order({ order_id: 1, side: 'SELL', price: '100', remaining: '2', filled_amount: '0' });
    const orderBook = {
      peekBestMaker: jest.fn().mockReturnValueOnce(maker).mockReturnValueOnce(null),
      popBestMaker: jest.fn().mockReturnValueOnce(maker),
      addOrder: jest.fn(),
    };
    const executeTrade = jest.fn().mockResolvedValue({
      trade_id: 1,
      pair_id: pairId,
      maker_order_id: 1,
      taker_order_id: 100,
      price: '100',
      amount: '1',
      taker_fee: '0',
      maker_fee: '0',
      fee_currency_id: 2,
      created_at: new Date(),
    } as TradeExecutionResult);
    const taker = order({ order_id: 100, side: 'BUY', price: '100', remaining: '1' });
    const context: MatchingContext = {
      pairId,
      takerOrder: taker,
      feeCurrencyId: 2,
      makerFeeRate: '0',
      takerFeeRate: '0',
    };
    const results = await strategy.match(context, orderBook as any, executeTrade as TradeExecutor);
    expect(results).toHaveLength(1);
    expect(orderBook.addOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        order_id: 1,
        remaining: '1',
        filled_amount: '1',
      }),
    );
  });

  it('skips push when executeTrade returns null', async () => {
    const maker = order({ order_id: 1, side: 'SELL', price: '100', remaining: '1' });
    const orderBook = {
      peekBestMaker: jest.fn().mockReturnValueOnce(maker).mockReturnValueOnce(null),
      popBestMaker: jest.fn().mockReturnValueOnce(maker),
      addOrder: jest.fn(),
    };
    const executeTrade = jest.fn().mockResolvedValue(null);
    const taker = order({ order_id: 100, side: 'BUY', price: '100', remaining: '1' });
    const context: MatchingContext = {
      pairId,
      takerOrder: taker,
      feeCurrencyId: 2,
      makerFeeRate: '0',
      takerFeeRate: '0',
    };
    const results = await strategy.match(context, orderBook as any, executeTrade as TradeExecutor);
    expect(results).toEqual([]);
    expect(orderBook.addOrder).not.toHaveBeenCalled();
  });
});
