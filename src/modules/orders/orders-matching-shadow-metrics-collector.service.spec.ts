import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ReconcileMatchingForPairUseCase } from './application/use-cases/reconcile-matching-for-pair.use-case';
import { OrdersMatchingShadowMetricsCollectorService } from './orders-matching-shadow-metrics-collector.service';

describe('OrdersMatchingShadowMetricsCollectorService', () => {
  it('collects metrics for configured monitor pairs', async () => {
    const reconcileMatchingForPairUseCase = {
      shadowParity: jest.fn().mockResolvedValue({
        pairId: 'pair-1',
        matchRatePercent: 100,
        unmatchedShadowRuns: 0,
      }),
    };

    const configValues: Record<string, string> = {
      MATCHING_SHADOW_MONITOR_PAIRS: 'pair-1,pair-2',
      MATCHING_ENGINE: 'go_canary',
      MATCHING_GO_CANARY_PAIRS: 'pair-3',
      MATCHING_SHADOW_ALERT_MIN_MATCH_RATE_PERCENT: '99.9',
      MATCHING_SHADOW_ALERT_MAX_UNMATCHED_RUNS: '0',
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        OrdersMatchingShadowMetricsCollectorService,
        { provide: ReconcileMatchingForPairUseCase, useValue: reconcileMatchingForPairUseCase },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => configValues[key],
          },
        },
      ],
    }).compile();

    const service = moduleRef.get(OrdersMatchingShadowMetricsCollectorService);
    await service.collect();

    expect(reconcileMatchingForPairUseCase.shadowParity).toHaveBeenCalledWith('pair-1', 24, 20);
    expect(reconcileMatchingForPairUseCase.shadowParity).toHaveBeenCalledWith('pair-2', 24, 20);
  });
});
