import { Test, TestingModule } from '@nestjs/testing';
import { MatchingProcessor } from './matching.processor';
import { MatchingService } from './matching.service';
import { MATCH_ORDER_JOB, MatchOrderJobData } from './matching-queue.service';
import { Job } from 'bull';
import { OrderBookOrder } from './interfaces';

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
  let matchingService: jest.Mocked<MatchingService>;

  beforeEach(async () => {
    matchingService = {
      runMatch: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<MatchingService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MatchingProcessor,
        { provide: MatchingService, useValue: matchingService },
      ],
    }).compile();

    processor = module.get(MatchingProcessor);
  });

  it('delegates to MatchingService.runMatch with job data', async () => {
    const data: MatchOrderJobData = {
      takerOrder: makeOrder({ order_id: 'tk-1' }),
      pairId: 'pair-1',
      feeCurrencyId: 'quote-1',
      makerFeeRate: '0.001',
      takerFeeRate: '0.002',
    };

    await processor.handleMatch(makeJob(data));

    expect(matchingService.runMatch).toHaveBeenCalledWith({
      takerOrder: data.takerOrder,
      pairId: data.pairId,
      feeCurrencyId: data.feeCurrencyId,
      makerFeeRate: data.makerFeeRate,
      takerFeeRate: data.takerFeeRate,
      slippageTolerance: undefined,
    });
  });

  it('forwards slippageTolerance from job data to runMatch', async () => {
    const data: MatchOrderJobData = {
      takerOrder: makeOrder({ order_id: 'tk-slip', type: 'MARKET' }),
      pairId: 'pair-1',
      feeCurrencyId: 'quote-1',
      makerFeeRate: '0.001',
      takerFeeRate: '0.002',
      slippageTolerance: '0.02',
    };

    await processor.handleMatch(makeJob(data));

    expect(matchingService.runMatch).toHaveBeenCalledWith(
      expect.objectContaining({ slippageTolerance: '0.02' }),
    );
  });

  it('rethrows MatchingService errors so Bull can retry', async () => {
    matchingService.runMatch.mockRejectedValueOnce(new Error('matching failed'));

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
