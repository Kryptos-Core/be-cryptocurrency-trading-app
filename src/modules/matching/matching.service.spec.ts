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
import { CircuitBreakerService } from './circuit-breaker.service';

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
        { provide: CircuitBreakerService, useValue: { isHalted: jest.fn().mockResolvedValue(false) } },
      ],
    }).compile();

    service = module.get(MatchingService);
    orderBookService = module.get(OrderBookService);
    matchingRepository = module.get(MatchingRepository);
    circuitBreaker = module.get(CircuitBreakerService);
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
    const acquiredKey = setArgs[0];    // 'matching:lock:pair-1'
    const acquiredValue = setArgs[1];  // crypto.randomBytes hex string

    // Lock released with Lua compare-and-delete
    expect(redisClient.eval).toHaveBeenCalled();
    const evalArgs = redisClient.eval.mock.calls[0];
    expect(evalArgs[1]).toBe(1);              // KEYS count
    expect(evalArgs[2]).toBe(acquiredKey);    // same key passed to SET
    expect(evalArgs[3]).toBe(acquiredValue);  // same value — proves identity check is consistent
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

  it('only seeds order book from DB on first match for a pair; subsequent matches use in-memory book', async () => {    matchingRepository.getOpenOrdersForPair.mockResolvedValue([]);

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
});
