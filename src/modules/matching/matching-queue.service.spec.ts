import { getQueueToken } from '@nestjs/bull';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Queue } from 'bull';
import type { OrderBookOrder } from './interfaces';
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
      ],
    }).compile();

    service = module.get(MatchingQueueService);
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

    expect(queue.add).toHaveBeenCalledWith(
      MATCH_ORDER_JOB,
      jobData,
      expect.objectContaining({ attempts: expect.any(Number) }),
    );
  });

  it('passes the job name as the first argument to queue.add', async () => {
    await service.enqueueMatch({
      takerOrder: makeOrder({ order_id: 'tk-2' }),
      pairId: 'pair-1',
      feeCurrencyId: 'quote-1',
      makerFeeRate: '0.001',
      takerFeeRate: '0.001',
    });

    const [[jobName]] = queue.add.mock.calls;
    expect(jobName).toBe(MATCH_ORDER_JOB);
  });

  it('propagates queue.add errors', async () => {
    queue.add.mockRejectedValueOnce(new Error('Redis unavailable'));

    await expect(
      service.enqueueMatch({
        takerOrder: makeOrder({ order_id: 'tk-err' }),
        pairId: 'pair-1',
        feeCurrencyId: 'quote-1',
        makerFeeRate: '0.001',
        takerFeeRate: '0.001',
      }),
    ).rejects.toThrow('Redis unavailable');
  });
});
