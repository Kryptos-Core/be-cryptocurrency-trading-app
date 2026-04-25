import { getQueueToken } from '@nestjs/bull';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Queue } from 'bull';
import type { OrderBookOrder } from '../../interfaces';
import {
  MATCH_ORDER_JOB,
  MATCHING_QUEUE,
  MatchingQueueService,
  type MatchOrderJobData,
} from './matching-queue.service';

function makeOrder(overrides: Partial<OrderBookOrder> & { order_id: string }): OrderBookOrder {
  return {
    pair_id: 'pair-1',
    user_id: 'user-1',
    side: 'BUY',
    type: 'LIMIT',
    price: '100',
    amount: '1',
    filled_amount: '0',
    status: 'OPEN',
    created_at: new Date('2025-01-01T00:00:00Z'),
    remaining: '1',
    ...overrides,
    order_id: overrides.order_id,
  };
}

describe('MatchingQueueService', () => {
  let service: MatchingQueueService;
  let queue: jest.Mocked<Queue>;

  beforeEach(async () => {
    queue = {
      add: jest.fn().mockResolvedValue({ id: 'job-1' }),
    } as unknown as jest.Mocked<Queue>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MatchingQueueService,
        {
          provide: getQueueToken(MATCHING_QUEUE),
          useValue: queue,
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('ts') },
        },
      ],
    }).compile();

    service = module.get(MatchingQueueService);
  });

  it('enqueues both shadow and primary jobs when MATCHING_ENGINE=go_shadow', async () => {
    const queueShadow = {
      add: jest.fn().mockResolvedValue({ id: 'job-shadow' }),
    } as unknown as jest.Mocked<Queue>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MatchingQueueService,
        {
          provide: getQueueToken(MATCHING_QUEUE),
          useValue: queueShadow,
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('go_shadow') },
        },
      ],
    }).compile();

    const shadowService = module.get(MatchingQueueService);

    const takerOrder = makeOrder({ order_id: 'tk-shadow-1' });
    const jobData: MatchOrderJobData = {
      takerOrder,
      pairId: 'pair-1',
      feeCurrencyId: 'quote-1',
      makerFeeRate: '0.001',
      takerFeeRate: '0.002',
    };

    await shadowService.enqueueMatch(jobData);

    expect(queueShadow.add).toHaveBeenCalledTimes(2);
    expect(queueShadow.add).toHaveBeenNthCalledWith(
      1,
      `${MATCH_ORDER_JOB}:shadow`,
      jobData,
      expect.objectContaining({ attempts: 1 }),
    );
    expect(queueShadow.add).toHaveBeenNthCalledWith(
      2,
      MATCH_ORDER_JOB,
      jobData,
      expect.objectContaining({ attempts: expect.any(Number) }),
    );
  });

  it('enqueues shadow only for configured canary pairs when MATCHING_ENGINE=go_canary', async () => {
    const queueCanary = {
      add: jest.fn().mockResolvedValue({ id: 'job-canary' }),
    } as unknown as jest.Mocked<Queue>;

    const configService = {
      get: jest.fn((key: string) => {
        if (key === 'MATCHING_ENGINE') return 'go_canary';
        if (key === 'MATCHING_GO_CANARY_PAIRS') return 'pair-canary-1,pair-canary-2';
        return undefined;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MatchingQueueService,
        {
          provide: getQueueToken(MATCHING_QUEUE),
          useValue: queueCanary,
        },
        {
          provide: ConfigService,
          useValue: configService,
        },
      ],
    }).compile();

    const canaryService = module.get(MatchingQueueService);

    const canaryData: MatchOrderJobData = {
      takerOrder: makeOrder({ order_id: 'tk-canary-1' }),
      pairId: 'pair-canary-1',
      feeCurrencyId: 'quote-1',
      makerFeeRate: '0.001',
      takerFeeRate: '0.002',
    };

    await canaryService.enqueueMatch(canaryData);

    expect(queueCanary.add).toHaveBeenNthCalledWith(
      1,
      `${MATCH_ORDER_JOB}:shadow`,
      canaryData,
      expect.objectContaining({ attempts: 1 }),
    );

    const nonCanaryData: MatchOrderJobData = {
      takerOrder: makeOrder({ order_id: 'tk-non-canary-1' }),
      pairId: 'pair-normal-1',
      feeCurrencyId: 'quote-1',
      makerFeeRate: '0.001',
      takerFeeRate: '0.002',
    };

    await canaryService.enqueueMatch(nonCanaryData);

    // 3 calls total: canary shadow + canary primary + non-canary primary
    expect(queueCanary.add).toHaveBeenCalledTimes(3);
    expect(queueCanary.add).toHaveBeenLastCalledWith(
      MATCH_ORDER_JOB,
      nonCanaryData,
      expect.objectContaining({ attempts: expect.any(Number) }),
    );
  });

  it('enqueues a MATCH_ORDER_JOB with correct payload', async () => {
    const takerOrder = makeOrder({ order_id: 'tk-1' });
    const jobData: MatchOrderJobData = {
      takerOrder,
      pairId: 'pair-1',
      feeCurrencyId: 'quote-1',
      makerFeeRate: '0.001',
      takerFeeRate: '0.002',
    };

    await service.enqueueMatch(jobData);

    expect(queue.add).toHaveBeenCalledTimes(1);
    expect(queue.add).toHaveBeenCalledWith(
      MATCH_ORDER_JOB,
      jobData,
      expect.objectContaining({ attempts: expect.any(Number) }),
    );
  });
});
