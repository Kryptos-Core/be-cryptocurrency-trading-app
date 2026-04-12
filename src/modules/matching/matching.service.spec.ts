import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { RedisService } from '@/common/services';
import { CircuitBreakerService } from './circuit-breaker.service';
import { MatchingLockContentionError } from './errors/matching-lock-contention.error';
import type { OrderBookOrder } from './interfaces';
import { MatchingService } from './matching.service';
import { OrderBookService } from './orderbook';
import { MatchingRepository } from './repositories';
import { MarketOrderStrategy } from './strategies/market-order.strategy';
import { PriceTimePriorityStrategy } from './strategies/price-time-priority.strategy';
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
  let circuitBreaker: jest.Mocked<CircuitBreakerService>;
  let redisClient: { set: jest.Mock; eval: jest.Mock };

  beforeEach(async () => {
    redisClient = {
      set: jest.fn().mockResolvedValue('OK'),
      eval: jest.fn().mockResolvedValue(1), // Lua returns 1 = key deleted (value matched)
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
              trade_id: 'trade-1',
              error_code: null,
              error_message: null,
            }),
            cancelIocRemainder: jest.fn().mockResolvedValue(undefined),
          },
        },
        PriceTimePriorityStrategy,
        MarketOrderStrategy,
        {
          provide: RedisService,
          useValue: { getClient: () => redisClient },
        },
        { provide: AuditTradeVisitor, useValue: { visit: jest.fn() } },
        { provide: MetricsTradeVisitor, useValue: { visit: jest.fn() } },
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
    matchingRepository = module.get(MatchingRepository);
    circuitBreaker = module.get(CircuitBreakerService);
  });

  it('throws MatchingLockContentionError when lock is not acquired after retries', async () => {
    redisClient.set.mockImplementation(() => Promise.resolve(null));

    await expect(
      service.runMatch({
        takerOrder: order({ order_id: 'tk1' }),
        pairId: 'pair-1',
        feeCurrencyId: 'quote-1',
        makerFeeRate: '0.001',
        takerFeeRate: '0.001',
      }),
    ).rejects.toThrow(MatchingLockContentionError);

    expect(matchingRepository.getOpenOrdersForPair).not.toHaveBeenCalled();
  });

  it('returns [] immediately when circuit breaker is halted', async () => {
    circuitBreaker.isHalted.mockResolvedValueOnce(true);

    const results = await service.runMatch({
      takerOrder: order({ order_id: 'tk-halted' }),
      pairId: 'pair-1',
      feeCurrencyId: 'quote-1',
      makerFeeRate: '0.001',
      takerFeeRate: '0.001',
    });

    expect(results).toEqual([]);
    // Should not acquire Redis lock or query DB when halted.
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
    // FOK order must be cancelled in DB
    expect(matchingRepository.cancelIocRemainder).toHaveBeenCalledWith('tk-fok', 'user-1');
  });

  it('FOK MARKET: slippage check prevents false positive when depth exists but second price breaches tolerance', async () => {
    const mkSell = (id: string, price: string, rem: string, uid = 'user-2') =>
      order({
        order_id: id,
        side: 'SELL',
        user_id: uid,
        type: 'LIMIT',
        price,
        remaining: rem,
        amount: rem,
      });

    matchingRepository.getOpenOrdersForPair.mockImplementation(
      async (_pairId: string, side: 'BUY' | 'SELL') => {
        if (side === 'SELL')
          return [mkSell('m-a', '100', '0.5'), mkSell('m-b', '110', '0.5', 'user-3')];
        return [];
      },
    );

    await expect(
      service.runMatch({
        takerOrder: order({
          order_id: 'tk-fok-mkt',
          side: 'BUY',
          type: 'MARKET',
          amount: '1',
          remaining: '1',
          time_in_force: 'FOK',
          slippage_tolerance: '0.05',
        }),
        pairId: 'pair-1',
        feeCurrencyId: 'quote-1',
        makerFeeRate: '0.001',
        takerFeeRate: '0.001',
      }),
    ).resolves.toEqual([]);

    expect(matchingRepository.executeTrade).not.toHaveBeenCalled();
    expect(matchingRepository.cancelIocRemainder).toHaveBeenCalledWith('tk-fok-mkt', 'user-1');
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

  it('releases lock via compare-and-delete Lua script with correct key and matching value', async () => {
    await service.runMatch({
      takerOrder: order({ order_id: 'tk1' }),
      pairId: 'pair-1',
      feeCurrencyId: 'quote-1',
      makerFeeRate: '0.001',
      takerFeeRate: '0.001',
    });

    // Lock acquired with SET NX
    expect(redisClient.set).toHaveBeenCalled();
    const setArgs = redisClient.set.mock.calls[0];
    const acquiredKey = setArgs[0]; // 'matching:lock:pair-1'
    const acquiredValue = setArgs[1]; // crypto.randomBytes hex string

    // Lock released with Lua compare-and-delete
    expect(redisClient.eval).toHaveBeenCalled();
    const evalArgs = redisClient.eval.mock.calls[0];
    expect(evalArgs[1]).toBe(1); // KEYS count
    expect(evalArgs[2]).toBe(acquiredKey); // same key passed to SET
    expect(evalArgs[3]).toBe(acquiredValue); // same value — proves identity check is consistent
  });

  it('does NOT delete another process lock when own lock expired (safe release)', async () => {
    // Simulate: our lock value is 'my-lock-value', but Redis now has 'other-process-value'
    // Lua script should return 0 (no delete) and not throw
    redisClient.eval.mockResolvedValueOnce(0); // Lua returns 0 = key not deleted (value mismatch)

    // Should not throw, just log warning
    await expect(
      service.runMatch({
        takerOrder: order({ order_id: 'tk-safe-release' }),
        pairId: 'pair-1',
        feeCurrencyId: 'quote-1',
        makerFeeRate: '0.001',
        takerFeeRate: '0.001',
      }),
    ).resolves.toBeDefined();
  });

  it('FOK with all makers owned by same user returns [] and does not execute any trade', async () => {
    // canFullyFillOrder must exclude self-owned makers (STP filter).
    // Without the fix, canFullyFillOrder would return true (sees 2 makers = enough liquidity),
    // then matching would skip both via STP → no fills → inconsistent behavior.
    const selfMaker1 = order({
      order_id: 'sm1',
      side: 'SELL',
      user_id: 'user-1', // same as taker
      price: '100',
      remaining: '1',
    });
    const selfMaker2 = order({
      order_id: 'sm2',
      side: 'SELL',
      user_id: 'user-1', // same as taker
      price: '100',
      remaining: '1',
    });

    matchingRepository.getOpenOrdersForPair.mockImplementation(
      async (_pairId: string, side: 'BUY' | 'SELL') => {
        if (side === 'SELL') return [selfMaker1, selfMaker2];
        return [];
      },
    );

    const results = await service.runMatch({
      takerOrder: order({
        order_id: 'tk-fok-stp',
        side: 'BUY',
        user_id: 'user-1',
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

  it('only seeds order book from DB on first match for a pair; subsequent matches use in-memory book', async () => {
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

    // Only 2 DB calls on the first match (BUY + SELL); second match uses in-memory book.
    expect(matchingRepository.getOpenOrdersForPair).toHaveBeenCalledTimes(2);
  });

  it('calls recordPriceAndCheck with fill price after each successful trade', async () => {
    const maker = order({
      order_id: 'm-cb',
      side: 'SELL',
      user_id: 'user-2',
      price: '150',
      remaining: '1',
    });
    matchingRepository.getOpenOrdersForPair.mockImplementation(
      async (_pairId: string, side: 'BUY' | 'SELL') => {
        if (side === 'SELL') return [maker];
        return [];
      },
    );
    // Mark pair as already seeded so incremental logic is used (no extra DB reload).
    orderBookService.markLoaded('pair-1');
    orderBookService.addOrder(maker);

    await service.runMatch({
      takerOrder: order({
        order_id: 'tk-cb',
        side: 'BUY',
        user_id: 'user-1',
        price: '150',
        remaining: '1',
      }),
      pairId: 'pair-1',
      feeCurrencyId: 'quote-1',
      makerFeeRate: '0.001',
      takerFeeRate: '0.001',
    });
    // Flush micro-task queue: recordPriceAndCheck is fire-and-forget; let promise resolve.
    await Promise.resolve();

    expect(circuitBreaker.recordPriceAndCheck).toHaveBeenCalledWith(
      'pair-1',
      '150',
      expect.objectContaining({ thresholdPct: expect.any(String) }),
    );
  });

  it('does not call recordPriceAndCheck when no fills occur', async () => {
    matchingRepository.getOpenOrdersForPair.mockResolvedValue([]);

    await service.runMatch({
      takerOrder: order({ order_id: 'tk-no-fill' }),
      pairId: 'pair-1',
      feeCurrencyId: 'quote-1',
      makerFeeRate: '0.001',
      takerFeeRate: '0.001',
    });

    expect(circuitBreaker.recordPriceAndCheck).not.toHaveBeenCalled();
  });

  // IOC order handling tests
  it('IOC order with partial fill: cancels remainder in DB, does not add remainder to book', async () => {
    const maker = order({
      order_id: 'm-ioc-partial',
      side: 'SELL',
      user_id: 'user-2',
      price: '100',
      amount: '0.5',
      remaining: '0.5',
    });

    matchingRepository.getOpenOrdersForPair.mockImplementation(
      async (_pairId: string, side: 'BUY' | 'SELL') => {
        if (side === 'SELL') return [maker];
        return [];
      },
    );
    orderBookService.markLoaded('pair-1');
    orderBookService.addOrder(maker);

    const results = await service.runMatch({
      takerOrder: order({
        order_id: 'tk-ioc-partial',
        side: 'BUY',
        user_id: 'user-1',
        type: 'LIMIT',
        price: '100',
        amount: '1',
        remaining: '1',
        time_in_force: 'IOC',
      }),
      pairId: 'pair-1',
      feeCurrencyId: 'quote-1',
      makerFeeRate: '0.001',
      takerFeeRate: '0.001',
    });

    expect(results).toHaveLength(1);
    expect(matchingRepository.cancelIocRemainder).toHaveBeenCalledWith('tk-ioc-partial', 'user-1');
    // Remainder must NOT be in the book
    expect(orderBookService.size('pair-1', 'BUY')).toBe(0);
  });

  it('IOC order with no fills: cancels order in DB immediately', async () => {
    matchingRepository.getOpenOrdersForPair.mockResolvedValue([]);

    await service.runMatch({
      takerOrder: order({
        order_id: 'tk-ioc-no-fill',
        side: 'BUY',
        user_id: 'user-1',
        type: 'LIMIT',
        price: '50', // price too low, no matching sellers
        amount: '1',
        remaining: '1',
        time_in_force: 'IOC',
      }),
      pairId: 'pair-1',
      feeCurrencyId: 'quote-1',
      makerFeeRate: '0.001',
      takerFeeRate: '0.001',
    });

    expect(matchingRepository.cancelIocRemainder).toHaveBeenCalledWith('tk-ioc-no-fill', 'user-1');
  });

  it('IOC order fully filled: does not call cancelIocRemainder', async () => {
    const maker = order({
      order_id: 'm-ioc-full',
      side: 'SELL',
      user_id: 'user-2',
      price: '100',
      amount: '1',
      remaining: '1',
    });

    matchingRepository.getOpenOrdersForPair.mockImplementation(
      async (_pairId: string, side: 'BUY' | 'SELL') => {
        if (side === 'SELL') return [maker];
        return [];
      },
    );
    orderBookService.markLoaded('pair-1');
    orderBookService.addOrder(maker);

    const results = await service.runMatch({
      takerOrder: order({
        order_id: 'tk-ioc-full',
        side: 'BUY',
        user_id: 'user-1',
        type: 'LIMIT',
        price: '100',
        amount: '1',
        remaining: '1',
        time_in_force: 'IOC',
      }),
      pairId: 'pair-1',
      feeCurrencyId: 'quote-1',
      makerFeeRate: '0.001',
      takerFeeRate: '0.001',
    });

    expect(results).toHaveLength(1);
    expect(matchingRepository.cancelIocRemainder).not.toHaveBeenCalled();
  });

  // Slippage tolerance wiring test
  it('passes slippageTolerance from params to MatchingContext — strategy halts on second maker exceeding tolerance', async () => {
    // Two sell makers: first at 100, second at 110 (10% higher than first fill reference).
    // With slippageTolerance='0.05' (5%), the second maker exceeds the threshold → stop after 1 fill.
    const maker1 = order({
      order_id: 'm-slip-1',
      side: 'SELL',
      user_id: 'user-2',
      price: '100',
      amount: '0.5',
      remaining: '0.5',
      type: 'LIMIT',
    });
    const maker2 = order({
      order_id: 'm-slip-2',
      side: 'SELL',
      user_id: 'user-3',
      price: '110', // 10% above first fill price (reference = 100)
      amount: '0.5',
      remaining: '0.5',
      type: 'LIMIT',
    });

    matchingRepository.getOpenOrdersForPair.mockImplementation(
      async (_pairId: string, side: 'BUY' | 'SELL') => {
        if (side === 'SELL') return [maker1, maker2];
        return [];
      },
    );
    orderBookService.markLoaded('pair-1');
    orderBookService.addOrder(maker1);
    orderBookService.addOrder(maker2);

    // Market BUY of 1 unit, but slippage tolerance is 5% — second maker at 110 exceeds 100 * 1.05 = 105
    const results = await service.runMatch({
      takerOrder: order({
        order_id: 'tk-slippage',
        side: 'BUY',
        user_id: 'user-1',
        type: 'MARKET',
        price: null,
        amount: '1',
        remaining: '1',
      }),
      pairId: 'pair-1',
      feeCurrencyId: 'quote-1',
      makerFeeRate: '0.001',
      takerFeeRate: '0.001',
      slippageTolerance: '0.05',
    });

    // Only the first fill executes; second maker is rejected by slippage protection
    expect(results).toHaveLength(1);
    expect(results[0].maker_order_id).toBe('m-slip-1');
  });
});
