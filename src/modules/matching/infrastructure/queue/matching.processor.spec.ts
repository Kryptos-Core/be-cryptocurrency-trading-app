import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { RunMatchUseCase } from '../../application/use-cases';
import { MatchingProcessor } from './matching.processor';

describe('MatchingProcessor', () => {
  it('skips shadow jobs when MATCHING_ENGINE is not go_shadow', async () => {
    const runMatchUseCase = {
      execute: jest.fn(),
    };
    const dataSource = {
      query: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        MatchingProcessor,
        { provide: RunMatchUseCase, useValue: runMatchUseCase },
        { provide: DataSource, useValue: dataSource },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('ts') },
        },
      ],
    }).compile();

    const processor = moduleRef.get(MatchingProcessor);
    await processor.handleShadowMatch({
      id: 'job-shadow-1',
      data: {
        takerOrder: {
          order_id: 'order-1',
        },
        pairId: 'pair-1',
      },
    } as never);

    expect(runMatchUseCase.execute).not.toHaveBeenCalled();
    expect(dataSource.query).not.toHaveBeenCalled();
  });

  it('persists a shadow run when MATCHING_ENGINE=go_shadow', async () => {
    const runMatchUseCase = {
      execute: jest.fn(),
    };
    const dataSource = {
      query: jest.fn().mockResolvedValue(undefined),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        MatchingProcessor,
        { provide: RunMatchUseCase, useValue: runMatchUseCase },
        { provide: DataSource, useValue: dataSource },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('go_shadow') },
        },
      ],
    }).compile();

    const processor = moduleRef.get(MatchingProcessor);
    await processor.handleShadowMatch({
      id: 'job-shadow-2',
      data: {
        takerOrder: {
          order_id: 'order-2',
          pair_id: 'pair-1',
          user_id: 'user-1',
          side: 'BUY',
          type: 'LIMIT',
          price: '100',
          amount: '1',
          filled_amount: '0',
          status: 'OPEN',
          created_at: new Date('2026-01-01T00:00:00Z'),
          remaining: '1',
        },
        pairId: 'pair-1',
      },
    } as never);

    expect(runMatchUseCase.execute).not.toHaveBeenCalled();
    expect(dataSource.query).toHaveBeenCalledTimes(1);
  });

  it('persists shadow run only for canary pairs when MATCHING_ENGINE=go_canary', async () => {
    const runMatchUseCase = {
      execute: jest.fn(),
    };
    const dataSource = {
      query: jest.fn().mockResolvedValue(undefined),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        MatchingProcessor,
        { provide: RunMatchUseCase, useValue: runMatchUseCase },
        { provide: DataSource, useValue: dataSource },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'MATCHING_ENGINE') return 'go_canary';
              if (key === 'MATCHING_GO_CANARY_PAIRS') return 'pair-canary-1,pair-canary-2';
              return undefined;
            }),
          },
        },
      ],
    }).compile();

    const processor = moduleRef.get(MatchingProcessor);

    await processor.handleShadowMatch({
      id: 'job-canary-match',
      data: {
        takerOrder: {
          order_id: 'order-canary-1',
        },
        pairId: 'pair-canary-1',
      },
    } as never);

    await processor.handleShadowMatch({
      id: 'job-non-canary-match',
      data: {
        takerOrder: {
          order_id: 'order-normal-1',
        },
        pairId: 'pair-normal-1',
      },
    } as never);

    expect(dataSource.query).toHaveBeenCalledTimes(1);
  });
});
