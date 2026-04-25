import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { MatchingShadowReconciliationUseCase } from './matching-shadow-reconciliation.use-case';

describe('MatchingShadowReconciliationUseCase', () => {
  it('returns parity summary with bounded values', async () => {
    const dataSource = {
      query: jest
        .fn()
        .mockResolvedValueOnce([{ shadow_runs: 10, matched_shadow_runs: 8, matched_trades: 12 }])
        .mockResolvedValueOnce([
          {
            run_id: 'run-1',
            pair_id: 'pair-1',
            order_id: 'order-1',
            mode: 'go_shadow',
            status: 'accepted',
            has_matched_trade: true,
            created_at: new Date('2026-04-25T00:00:00.000Z'),
          },
        ])
        .mockResolvedValueOnce([{ order_id: 'order-9' }]),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        MatchingShadowReconciliationUseCase,
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    const useCase = moduleRef.get(MatchingShadowReconciliationUseCase);
    const result = await useCase.execute({ pairId: 'pair-1', windowHours: 24, limit: 10 });

    expect(result.pairId).toBe('pair-1');
    expect(result.shadowRuns).toBe(10);
    expect(result.matchedShadowRuns).toBe(8);
    expect(result.unmatchedShadowRuns).toBe(2);
    expect(result.matchedTrades).toBe(12);
    expect(result.missingTrades).toBe(2);
    expect(result.matchRatePercent).toBe(80);
    expect(result.unmatchedOrderIds).toEqual(['order-9']);
    expect(result.recentRuns).toHaveLength(1);
    expect(result.recentRuns[0]?.hasMatchedTrade).toBe(true);
    expect(dataSource.query).toHaveBeenCalledTimes(3);
  });
});
