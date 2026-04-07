import { Test, TestingModule } from '@nestjs/testing';
import { CircuitBreakerService } from './circuit-breaker.service';
import { RedisService } from '@/common/services';

/** Simple in-memory Redis mock that actually stores values via set/get. */
function makeRedisClientMock() {
  const store = new Map<string, string>();
  return {
    get: jest.fn(async (key: string) => store.get(key) ?? null),
    set: jest.fn(async (key: string, value: string, ..._args: any[]) => {
      store.set(key, value);
      return 'OK';
    }),
    del: jest.fn(async (key: string) => {
      const existed = store.has(key);
      store.delete(key);
      return existed ? 1 : 0;
    }),
  };
}

describe('CircuitBreakerService', () => {
  let service: CircuitBreakerService;
  let redisClient: ReturnType<typeof makeRedisClientMock>;

  beforeEach(async () => {
    redisClient = makeRedisClientMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CircuitBreakerService,
        { provide: RedisService, useValue: { getClient: () => redisClient } },
      ],
    }).compile();

    service = module.get(CircuitBreakerService);
  });

  describe('isHalted', () => {
    it('returns false when no halt key in Redis', async () => {
      const halted = await service.isHalted('pair-1');
      expect(halted).toBe(false);
    });

    it('returns true when halt key exists in Redis', async () => {
      // Seed the halt key directly via set mock
      await redisClient.set('circuit:halt:pair-1', 'HALTED');
      const halted = await service.isHalted('pair-1');
      expect(halted).toBe(true);
    });
  });

  describe('recordPrice + shouldTrigger', () => {
    it('does not trigger when price change is within threshold', async () => {
      // 0.5% change, threshold 5%
      const triggered = await service.recordPriceAndCheck('pair-1', '100', {
        thresholdPct: '0.05',
        windowSec: 60,
        haltDurationSec: 300,
      });
      expect(triggered).toBe(false);

      const triggered2 = await service.recordPriceAndCheck('pair-1', '100.5', {
        thresholdPct: '0.05',
        windowSec: 60,
        haltDurationSec: 300,
      });
      expect(triggered2).toBe(false);
    });

    it('triggers and halts when price change exceeds threshold', async () => {
      // First call establishes reference price
      await service.recordPriceAndCheck('pair-1', '100', {
        thresholdPct: '0.05',
        windowSec: 60,
        haltDurationSec: 300,
      });

      // Second call: 10% move → triggers
      const triggered = await service.recordPriceAndCheck('pair-1', '110', {
        thresholdPct: '0.05',
        windowSec: 60,
        haltDurationSec: 300,
      });

      expect(triggered).toBe(true);
      // Should have written halt key to Redis
      expect(redisClient.set).toHaveBeenCalledWith(
        expect.stringContaining('circuit:halt:pair-1'),
        expect.any(String),
        'EX',
        300,
      );
    });

    it('triggers on downward move exceeding threshold', async () => {
      await service.recordPriceAndCheck('pair-1', '100', {
        thresholdPct: '0.05',
        windowSec: 60,
        haltDurationSec: 300,
      });
      const triggered = await service.recordPriceAndCheck('pair-1', '90', {
        thresholdPct: '0.05',
        windowSec: 60,
        haltDurationSec: 300,
      });
      expect(triggered).toBe(true);
    });
  });

  describe('resumeTrading', () => {
    it('removes halt key from Redis', async () => {
      await service.resumeTrading('pair-1');
      expect(redisClient.del).toHaveBeenCalledWith(
        expect.stringContaining('circuit:halt:pair-1'),
      );
    });
  });
});
