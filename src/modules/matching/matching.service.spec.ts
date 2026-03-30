import { Test, TestingModule } from '@nestjs/testing';
import { MatchingService } from './matching.service';
import { OrderBookService } from './orderbook';
import { MatchingRepository } from './repositories';
import { PriceTimePriorityStrategy } from './strategies/price-time-priority.strategy';
import { MarketOrderStrategy } from './strategies/market-order.strategy';
import { RedisService } from '@/common/services';
import { OrderBookOrder } from './interfaces';
import { AuditTradeVisitor } from './visitors/audit-trade.visitor';
import { MetricsTradeVisitor } from './visitors/metrics-trade.visitor';

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

describe('MatchingService', () => {
  let service: MatchingService;
  let orderBookService: OrderBookService;
  let matchingRepository: jest.Mocked<MatchingRepository>;
  let redisClient: { set: jest.Mock };
  let redisDel: jest.Mock;

  beforeEach(async () => {
    redisClient = { set: jest.fn().mockResolvedValue('OK') };
    redisDel = jest.fn().mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MatchingService,
        OrderBookService,
        {
          provide: MatchingRepository,
          useValue: {
            getOpenOrdersForPair: jest.fn().mockResolvedValue([]),
            executeTrade: jest.fn().mockResolvedValue({
              trade_id: 'trade-1',
              error_code: null,
              error_message: null,
            }),
          },
        },
        PriceTimePriorityStrategy,
        MarketOrderStrategy,
        {
          provide: RedisService,
          useValue: { getClient: () => redisClient, del: redisDel },
        },
        { provide: AuditTradeVisitor, useValue: { visit: jest.fn() } },
        { provide: MetricsTradeVisitor, useValue: { visit: jest.fn() } },
      ],
    }).compile();

    service = module.get(MatchingService);
    orderBookService = module.get(OrderBookService);
    matchingRepository = module.get(MatchingRepository);
  });

  it('returns [] when lock is not acquired after retries', async () => {
    redisClient.set.mockImplementation(() => Promise.resolve(null));

    const results = await service.runMatch({
      takerOrder: order({ order_id: 'tk1' }),
      pairId: 'pair-1',
      feeCurrencyId: 'quote-1',
      makerFeeRate: '0.001',
      takerFeeRate: '0.001',
    });

    expect(results).toEqual([]);
    expect(matchingRepository.getOpenOrdersForPair).not.toHaveBeenCalled();
  });

  it('skips FOK execution when liquidity is insufficient', async () => {
    const maker = order({
      order_id: 'm1',
      side: 'SELL',
      type: 'LIMIT',
      amount: '1',
      remaining: '1',
      price: '100',
    });

    matchingRepository.getOpenOrdersForPair.mockImplementation(
      async (_pairId: string, side: 'BUY' | 'SELL') => {
        if (side === 'SELL') return [maker];
        return [];
      },
    );

    const results = await service.runMatch({
      takerOrder: order({
        order_id: 'tk-fok',
        side: 'BUY',
        type: 'LIMIT',
        amount: '2',
        remaining: '2',
        time_in_force: 'FOK',
      }),
      pairId: 'pair-1',
      feeCurrencyId: 'quote-1',
      makerFeeRate: '0.001',
      takerFeeRate: '0.001',
    });

    expect(results).toEqual([]);
    expect(matchingRepository.executeTrade).not.toHaveBeenCalled();
  });

  it('does not duplicate taker snapshot when same order already loaded in book', async () => {
    const takerLoadedFromDb = order({
      order_id: 'tk-dup',
      side: 'BUY',
      type: 'LIMIT',
      amount: '1',
      remaining: '1',
      price: '100',
      time_in_force: 'GTC',
    });

    matchingRepository.getOpenOrdersForPair.mockImplementation(
      async (_pairId: string, side: 'BUY' | 'SELL') => {
        if (side === 'BUY') return [takerLoadedFromDb];
        return [];
      },
    );

    const results = await service.runMatch({
      takerOrder: takerLoadedFromDb,
      pairId: 'pair-1',
      feeCurrencyId: 'quote-1',
      makerFeeRate: '0.001',
      takerFeeRate: '0.001',
    });

    expect(results).toEqual([]);
    expect(orderBookService.size('pair-1', 'BUY')).toBe(1);
    expect(orderBookService.peekBestMaker('pair-1', 'BUY')?.order_id).toBe('tk-dup');
  });

  it('releases lock in finally block', async () => {
    await service.runMatch({
      takerOrder: order({ order_id: 'tk1' }),
      pairId: 'pair-1',
      feeCurrencyId: 'quote-1',
      makerFeeRate: '0.001',
      takerFeeRate: '0.001',
    });

    expect(redisDel).toHaveBeenCalledWith('matching:lock:pair-1');
  });

  it('reloads order book from DB on every match (buy + sell queries)', async () => {
    matchingRepository.getOpenOrdersForPair.mockResolvedValue([]);

    await service.runMatch({
      takerOrder: order({ order_id: 'tk1' }),
      pairId: 'pair-1',
      feeCurrencyId: 'quote-1',
      makerFeeRate: '0.001',
      takerFeeRate: '0.001',
    });
    await service.runMatch({
      takerOrder: order({ order_id: 'tk2' }),
      pairId: 'pair-1',
      feeCurrencyId: 'quote-1',
      makerFeeRate: '0.001',
      takerFeeRate: '0.001',
    });

    expect(matchingRepository.getOpenOrdersForPair).toHaveBeenCalledTimes(4);
  });
});
