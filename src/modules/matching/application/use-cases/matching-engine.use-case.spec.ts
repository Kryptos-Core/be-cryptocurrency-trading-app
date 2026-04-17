import { Test } from '@nestjs/testing';
import { MatchingQueueService } from '../../infrastructure/queue/matching-queue.service';
import { EnqueueMatchUseCase } from './index';

describe('EnqueueMatchUseCase', () => {
  const matchingQueueService = {
    enqueueMatch: jest.fn(),
  };

  let useCase: EnqueueMatchUseCase;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        EnqueueMatchUseCase,
        { provide: MatchingQueueService, useValue: matchingQueueService },
      ],
    }).compile();

    useCase = moduleRef.get(EnqueueMatchUseCase);
  });

  it('forwards command payload to queue service unchanged', async () => {
    const command = {
      takerOrder: {
        order_id: 'o1',
        pair_id: 'p1',
        user_id: 'u1',
        side: 'BUY',
        type: 'LIMIT',
        price: '100',
        amount: '1',
        filled_amount: '0',
        status: 'OPEN',
        created_at: new Date('2026-01-01T00:00:00Z'),
        remaining: '1',
      },
      pairId: 'p1',
      feeCurrencyId: 'quote',
      makerFeeRate: '0.001',
      takerFeeRate: '0.002',
      slippageTolerance: '0.01',
    };

    await useCase.execute(command as any);

    expect(matchingQueueService.enqueueMatch).toHaveBeenCalledWith(command);
  });
});
