import { Test, TestingModule } from '@nestjs/testing';
import { MatchingService } from './matching.service';
import { OrderBookService } from './orderbook';
import { MatchingRepository } from './repositories';
import { PriceTimePriorityStrategy } from './strategies/price-time-priority.strategy';
import { MarketOrderStrategy } from './strategies/market-order.strategy';
import { RedisService } from '@/common/services';
import { OrderBookOrder, TradeExecutionResult } from './interfaces';

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

describe('MatchingService', () => {
  let service: MatchingService;
  let orderBookService: OrderBookService;
  let matchingRepository: jest.Mocked<MatchingRepository>;
  let redisClient: { set: jest.Mock };
  let redisDel: jest.Mock;

  beforeEach(async () => {
    redisClient = { set: jest.fn().mockResolvedValue('OK') };
    redisDel = jest.fn().mockResolvedValue(undefined);
    const mockRedisService = {
      getClient: () => redisClient,
      del: redisDel,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MatchingService,
        OrderBookService,
        {
          provide: MatchingRepository,
          useValue: {
            getOpenOrdersForPair: jest.fn().mockResolvedValue([]),
            executeTrade: jest.fn().mockResolvedValue({
              trade_id: 1,
              error_code: null,
              error_message: null,
            }),
          },
        },
        PriceTimePriorityStrategy,
        MarketOrderStrategy,
        { provide: RedisService, useValue: mockRedisService },
      ],
    }).compile();

    service = module.get(MatchingService);
    orderBookService = module.get(OrderBookService);
    matchingRepository = module.get(MatchingRepository);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('runMatch', () => {
    it('returns [] when lock not acquired', async () => {
      redisClient.set.mockResolvedValueOnce(null);
      const taker = order({ order_id: 100, side: 'BUY', price: '100', remaining: '1' });
      const results = await service.runMatch({
        takerOrder: taker,
        pairId: 1,
        feeCurrencyId: 2,
        makerFeeRate: '0.001',
        takerFeeRate: '0.001',
      });
      expect(results).toEqual([]);
      expect(matchingRepository.getOpenOrdersForPair).not.toHaveBeenCalled();
    });

    it('loads book from repo when size is 0 and runs strategy', async () => {
      const taker = order({ order_id: 100, side: 'BUY', price: '100', remaining: '1' });
      const results = await service.runMatch({
        takerOrder: taker,
        pairId: 1,
        feeCurrencyId: 2,
        makerFeeRate: '0.001',
        takerFeeRate: '0.001',
      });
      expect(matchingRepository.getOpenOrdersForPair).toHaveBeenCalledWith(1, 'BUY');
      expect(matchingRepository.getOpenOrdersForPair).toHaveBeenCalledWith(1, 'SELL');
      expect(results).toEqual([]);
      expect(redisDel).toHaveBeenCalledWith('matching:lock:1');
    });

    it('does not load book when orderbook already has orders', async () => {
      orderBookService.loadOrders(1, [order({ order_id: 1, side: 'SELL', price: '99', remaining: '1' })]);
      const taker = order({ order_id: 100, side: 'BUY', price: '100', remaining: '1' });
      await service.runMatch({
        takerOrder: taker,
        pairId: 1,
        feeCurrencyId: 2,
        makerFeeRate: '0.001',
        takerFeeRate: '0.001',
      });
      expect(matchingRepository.getOpenOrdersForPair).not.toHaveBeenCalled();
    });

    it('executes trade and notifies observer when limit BUY matches SELL maker', async () => {
      matchingRepository.getOpenOrdersForPair.mockResolvedValue([]);
      orderBookService.addOrder(order({ order_id: 1, side: 'SELL', price: '99', remaining: '1' }));
      matchingRepository.executeTrade.mockResolvedValue({
        trade_id: 10,
        error_code: null,
        error_message: null,
      });
      const observer = jest.fn();
      service.onTradeExecuted(observer);
      const taker = order({ order_id: 100, side: 'BUY', price: '100', remaining: '1', type: 'LIMIT' });
      const results = await service.runMatch({
        takerOrder: taker,
        pairId: 1,
        feeCurrencyId: 2,
        makerFeeRate: '0.001',
        takerFeeRate: '0.001',
      });
      expect(results).toHaveLength(1);
      expect(results[0].trade_id).toBe(10);
      expect(results[0].amount).toBe('1');
      expect(results[0].price).toBe('99');
      expect(matchingRepository.executeTrade).toHaveBeenCalledWith(
        expect.objectContaining({
          pairId: 1,
          makerOrderId: 1,
          takerOrderId: 100,
          price: '99',
          amount: '1',
        }),
      );
      expect(observer).toHaveBeenCalledWith(
        expect.objectContaining({
          trade_id: 10,
          maker_order_id: 1,
          taker_order_id: 100,
          amount: '1',
        }),
      );
    });

    it('uses market strategy for MARKET order type', async () => {
      orderBookService.addOrder(order({ order_id: 1, side: 'SELL', price: '100', remaining: '1' }));
      matchingRepository.executeTrade.mockResolvedValue({
        trade_id: 11,
        error_code: null,
        error_message: null,
      });
      const taker = order({
        order_id: 101,
        side: 'BUY',
        remaining: '1',
        type: 'MARKET',
        price: null,
      });
      const results = await service.runMatch({
        takerOrder: taker,
        pairId: 1,
        feeCurrencyId: 2,
        makerFeeRate: '0',
        takerFeeRate: '0',
      });
      expect(results).toHaveLength(1);
      expect(results[0].trade_id).toBe(11);
    });

    it('adds taker back to book when remaining > 0 and status OPEN', async () => {
      orderBookService.addOrder(order({ order_id: 1, side: 'SELL', price: '100', remaining: '0.5' }));
      matchingRepository.executeTrade.mockResolvedValue({
        trade_id: 12,
        error_code: null,
        error_message: null,
      });
      const taker = order({
        order_id: 102,
        side: 'BUY',
        price: '100',
        remaining: '1',
        status: 'OPEN',
      });
      const results = await service.runMatch({
        takerOrder: taker,
        pairId: 1,
        feeCurrencyId: 2,
        makerFeeRate: '0',
        takerFeeRate: '0',
      });
      expect(results).toHaveLength(1);
      expect(results[0].amount).toBe('0.5');
      expect(orderBookService.size(1, 'BUY')).toBe(1);
      const rest = orderBookService.peekBestMaker(1, 'BUY');
      expect(rest).not.toBeNull();
      expect(parseFloat(rest!.remaining)).toBe(0.5);
    });

    it('releases lock in finally when strategy throws', async () => {
      const mockStrategy = jest.fn().mockRejectedValue(new Error('strategy error'));
      const module2 = await Test.createTestingModule({
        providers: [
          MatchingService,
          OrderBookService,
          {
            provide: MatchingRepository,
            useValue: {
              getOpenOrdersForPair: jest.fn().mockResolvedValue([]),
              executeTrade: jest.fn(),
            },
          },
          {
            provide: PriceTimePriorityStrategy,
            useValue: { match: mockStrategy },
          },
          {
            provide: MarketOrderStrategy,
            useValue: { match: mockStrategy },
          },
          {
            provide: RedisService,
            useValue: { getClient: () => redisClient, del: redisDel },
          },
        ],
      }).compile();
      const svc = module2.get(MatchingService);
      const taker = order({ order_id: 100, side: 'BUY', remaining: '1' });
      await expect(
        svc.runMatch({
          takerOrder: taker,
          pairId: 1,
          feeCurrencyId: 2,
          makerFeeRate: '0',
          takerFeeRate: '0',
        }),
      ).rejects.toThrow('strategy error');
      expect(redisDel).toHaveBeenCalledWith('matching:lock:1');
    });
  });

  describe('onTradeExecuted', () => {
    it('registers callback and calls it when trade executed', async () => {
      orderBookService.addOrder(order({ order_id: 1, side: 'SELL', price: '100', remaining: '1' }));
      matchingRepository.executeTrade.mockResolvedValue({
        trade_id: 20,
        error_code: null,
        error_message: null,
      });
      const cb = jest.fn();
      service.onTradeExecuted(cb);
      const taker = order({ order_id: 200, side: 'BUY', price: '100', remaining: '1' });
      await service.runMatch({
        takerOrder: taker,
        pairId: 1,
        feeCurrencyId: 2,
        makerFeeRate: '0',
        takerFeeRate: '0',
      });
      expect(cb).toHaveBeenCalledTimes(1);
      expect(cb.mock.calls[0][0]).toMatchObject({
        trade_id: 20,
        maker_order_id: 1,
        taker_order_id: 200,
        amount: '1',
      });
    });
  });
});
