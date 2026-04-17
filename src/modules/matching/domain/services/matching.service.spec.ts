import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { RedisService } from '@/common/services';
import { MATCHING_REPOSITORY, type MatchingRepositoryPort } from '../../domain/ports';
import { MatchingLockContentionError } from '../../errors/matching-lock-contention.error';
import { AuditTradeVisitor, MetricsTradeVisitor } from '../../infrastructure/observers';
import type { OrderBookOrder } from '../../interfaces';
import { CircuitBreakerService } from './circuit-breaker.service';
import { MatchingService } from './matching.service';
import { OrderBookService } from './orderbook';
import { MarketOrderStrategy } from './strategies/market-order.strategy';
import { PriceTimePriorityStrategy } from './strategies/price-time-priority.strategy';

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
  let matchingRepository: jest.Mocked<MatchingRepositoryPort>;
  let circuitBreaker: jest.Mocked<CircuitBreakerService>;
  let redisClient: { set: jest.Mock; eval: jest.Mock };

  beforeEach(async () => {
    redisClient = {
      set: jest.fn().mockResolvedValue('OK'),
      eval: jest.fn().mockResolvedValue(1),
    };
    matchingRepository = {
      getOpenOrdersForPair: jest.fn().mockResolvedValue([]),
      executeTrade: jest.fn(),
      cancelIocRemainder: jest.fn(),
    } as unknown as jest.Mocked<MatchingRepositoryPort>;
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MatchingService,
        OrderBookService,
        PriceTimePriorityStrategy,
        MarketOrderStrategy,
        { provide: MATCHING_REPOSITORY, useValue: matchingRepository },
        { provide: RedisService, useValue: { getClient: () => redisClient } },
        {
          provide: AuditTradeVisitor,
          useValue: { visit: jest.fn() },
        },
        {
          provide: MetricsTradeVisitor,
          useValue: { visit: jest.fn() },
        },
        {
          provide: CircuitBreakerService,
          useValue: {
            isHalted: jest.fn().mockResolvedValue(false),
            recordPriceAndCheck: jest.fn().mockResolvedValue(false),
          },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue(undefined) },
        },
      ],
    }).compile();

    service = module.get(MatchingService);
    orderBookService = module.get(OrderBookService);
    circuitBreaker = module.get(CircuitBreakerService);
  });

  it('skips matching when circuit breaker is halted', async () => {
    circuitBreaker.isHalted.mockResolvedValueOnce(true);

    const results = await service.runMatch({
      takerOrder: order({ order_id: 'taker-1' }),
      pairId: 'pair-1',
      feeCurrencyId: 'quote-1',
      makerFeeRate: '0.001',
      takerFeeRate: '0.002',
    });

    expect(results).toEqual([]);
    expect(redisClient.set).not.toHaveBeenCalled();
  });

  it('throws lock contention when redis lock cannot be acquired', async () => {
    redisClient.set.mockResolvedValue(null);

    await expect(
      service.runMatch({
        takerOrder: order({ order_id: 'taker-lock' }),
        pairId: 'pair-1',
        feeCurrencyId: 'quote-1',
        makerFeeRate: '0.001',
        takerFeeRate: '0.002',
      }),
    ).rejects.toBeInstanceOf(MatchingLockContentionError);
  });
});
