import { Test, TestingModule } from '@nestjs/testing';
import { MarketOrderStrategy } from './market-order.strategy';
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
    type: 'MARKET',
    price: null,
    amount: '1',
    filled_amount: '0',
    status: 'OPEN',
    created_at: new Date(),
    remaining: '1',
    ...overrides,
    order_id: overrides.order_id,
  };
}

describe('MarketOrderStrategy', () => {
  let strategy: MarketOrderStrategy;
  const pairId = 1;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MarketOrderStrategy],
    }).compile();
    strategy = module.get(MarketOrderStrategy);
  });

  it('should be defined', () => {
    expect(strategy).toBeDefined();
  });

  describe('match', () => {
    it('returns empty when no maker', async () => {
      const orderBook = {
        peekBestMaker: jest.fn().mockReturnValue(null),
        popBestMaker: jest.fn(),
        addOrder: jest.fn(),
      };
      const executeTrade = jest.fn();
      const taker = order({ order_id: 100, side: 'BUY', remaining: '1' });
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

    it('matches at best available price (no price check)', async () => {
      const maker = order({ order_id: 1, side: 'SELL', price: '999', remaining: '1' });
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
        price: '999',
        amount: '1',
        taker_fee: '0',
        maker_fee: '0',
        fee_currency_id: 2,
        created_at: new Date(),
      };
      const executeTrade = jest.fn().mockResolvedValue(tradeResult);
      const taker = order({ order_id: 100, side: 'BUY', remaining: '1' });
      const context: MatchingContext = {
        pairId,
        takerOrder: taker,
        feeCurrencyId: 2,
        makerFeeRate: '0',
        takerFeeRate: '0',
      };
      const results = await strategy.match(context, orderBook as any, executeTrade as TradeExecutor);
      expect(results).toHaveLength(1);
      expect(results[0].price).toBe('999');
      expect(executeTrade).toHaveBeenCalledWith(maker, '1', '999');
    });

    it('consumes multiple makers until taker filled or book empty', async () => {
      const m1 = order({ order_id: 1, side: 'SELL', price: '100', remaining: '0.5' });
      const m2 = order({ order_id: 2, side: 'SELL', price: '101', remaining: '1' });
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
        .mockResolvedValueOnce({ trade_id: 1, pair_id: pairId, maker_order_id: 1, taker_order_id: 100, price: '100', amount: '0.5', taker_fee: '0', maker_fee: '0', fee_currency_id: 2, created_at: new Date() } as TradeExecutionResult)
        .mockResolvedValueOnce({ trade_id: 2, pair_id: pairId, maker_order_id: 2, taker_order_id: 100, price: '101', amount: '0.5', taker_fee: '0', maker_fee: '0', fee_currency_id: 2, created_at: new Date() } as TradeExecutionResult);
      const taker = order({ order_id: 100, side: 'BUY', remaining: '1' });
      const context: MatchingContext = {
        pairId,
        takerOrder: taker,
        feeCurrencyId: 2,
        makerFeeRate: '0',
        takerFeeRate: '0',
      };
      const results = await strategy.match(context, orderBook as any, executeTrade as TradeExecutor);
      expect(results).toHaveLength(2);
      expect(results[0].amount).toBe('0.5');
      expect(results[1].amount).toBe('0.5');
      expect(orderBook.addOrder).toHaveBeenCalledWith(
        expect.objectContaining({ order_id: 2, remaining: '0.5' }),
      );
    });
  });
});
