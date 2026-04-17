import { Test } from '@nestjs/testing';
import type { Job } from 'bull';
import { RunMatchUseCase } from './application/use-cases';
import type { OrderBookOrder } from './interfaces';
import { MatchingProcessor } from './matching.processor';
import { MATCH_ORDER_JOB, type MatchOrderJobData } from './matching-queue.service';

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

function makeJob(data: MatchOrderJobData): Job<MatchOrderJobData> {
  return { data, id: 'job-1', name: MATCH_ORDER_JOB } as unknown as Job<MatchOrderJobData>;
}

describe('MatchingProcessor', () => {
  let processor: MatchingProcessor;
  let runMatchUseCase: jest.Mocked<RunMatchUseCase>;

  beforeEach(async () => {
    runMatchUseCase = {
      execute: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<RunMatchUseCase>;

    const moduleRef = await Test.createTestingModule({
      providers: [MatchingProcessor, { provide: RunMatchUseCase, useValue: runMatchUseCase }],
    }).compile();

    processor = moduleRef.get(MatchingProcessor);
  });

  it('delegates to RunMatchUseCase with job data', async () => {
    const data: MatchOrderJobData = {
      takerOrder: makeOrder({ order_id: 'tk-1' }),
      pairId: 'pair-1',
      feeCurrencyId: 'quote-1',
      makerFeeRate: '0.001',
      takerFeeRate: '0.002',
    };

    await processor.handleMatch(makeJob(data));

    expect(runMatchUseCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        takerOrder: data.takerOrder,
        pairId: data.pairId,
        feeCurrencyId: data.feeCurrencyId,
        makerFeeRate: data.makerFeeRate,
        takerFeeRate: data.takerFeeRate,
        slippageTolerance: undefined,
      }),
    );
  });

  it('forwards slippageTolerance from job data to use-case', async () => {
    const data: MatchOrderJobData = {
      takerOrder: makeOrder({ order_id: 'tk-slip', type: 'MARKET' }),
      pairId: 'pair-1',
      feeCurrencyId: 'quote-1',
      makerFeeRate: '0.001',
      takerFeeRate: '0.002',
      slippageTolerance: '0.02',
    };

    await processor.handleMatch(makeJob(data));

    expect(runMatchUseCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({ slippageTolerance: '0.02' }),
    );
  });

  it('rethrows use-case errors so Bull can retry', async () => {
    runMatchUseCase.execute.mockRejectedValueOnce(new Error('matching failed'));

    await expect(
      processor.handleMatch(
        makeJob({
          takerOrder: makeOrder({ order_id: 'tk-err' }),
          pairId: 'pair-1',
          feeCurrencyId: 'quote-1',
          makerFeeRate: '0.001',
          takerFeeRate: '0.001',
        }),
      ),
    ).rejects.toThrow('matching failed');
  });
});
