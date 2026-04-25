import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { MarketReadModelReconciliationService } from '@/modules/markets/market-read-model-reconciliation.service';
import { PublicWsPayloadParityService } from './public-ws-payload-parity.service';
import { GoRolloutReadinessService } from './go-rollout-readiness.service';

describe('GoRolloutReadinessService', () => {
  it('returns readiness with blockers when thresholds are violated', async () => {
    const configValues: Record<string, string> = {
      GO_ROLLOUT_WINDOW_HOURS: '24',
      MATCHING_SHADOW_ALERT_MIN_MATCH_RATE_PERCENT: '99.9',
      MATCHING_SHADOW_ALERT_MAX_UNMATCHED_RUNS: '0',
      GO_ROLLOUT_MAX_PUBLIC_WS_DRIFT_PAIRS: '0',
      MATCHING_GO_CANARY_PAIRS: 'pair-1',
      MATCHING_SHADOW_MONITOR_PAIRS: 'pair-1',
      TICKER_SOURCE: 'go_aggregator',
      MATCHING_ENGINE: 'go_canary',
      PUBLIC_WS_SOURCE: 'nestjs',
    };

    const dataSource = {
      query: jest.fn().mockResolvedValue([{ shadow_runs: 10, matched_shadow_runs: 8 }]),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        GoRolloutReadinessService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => configValues[key],
          },
        },
        {
          provide: DataSource,
          useValue: dataSource,
        },
        {
          provide: MarketReadModelReconciliationService,
          useValue: {
            getProjectionHealth: jest.fn().mockResolvedValue({
              status: 'up',
              lag: {
                trades: { lagSeconds: 1 },
                tickers: { lagSeconds: 1 },
                ohlcv: { lagSeconds: 1 },
              },
            }),
          },
        },
        {
          provide: PublicWsPayloadParityService,
          useValue: {
            getReport: jest.fn().mockReturnValue({
              ticker: { contractValid: true },
              ohlc: { contractValid: true },
              goAggregatorParity: { comparedPairs: 1, driftPairs: 1 },
            }),
          },
        },
      ],
    }).compile();

    const service = moduleRef.get(GoRolloutReadinessService);
    const report = await service.getReadiness();

    expect(report.ready).toBe(false);
    expect(report.blockers).toContain('public_ws_drift_exceeded');
    expect(report.blockers).toContain('matching_shadow_threshold_exceeded');
  });
});


  it('lists snapshots and returns latest snapshot', async () => {
    const configValues: Record<string, string> = {
      GO_ROLLOUT_WINDOW_HOURS: '24',
      MATCHING_SHADOW_ALERT_MIN_MATCH_RATE_PERCENT: '99.9',
      MATCHING_SHADOW_ALERT_MAX_UNMATCHED_RUNS: '0',
      GO_ROLLOUT_MAX_PUBLIC_WS_DRIFT_PAIRS: '0',
      MATCHING_GO_CANARY_PAIRS: '',
      MATCHING_SHADOW_MONITOR_PAIRS: '',
      TICKER_SOURCE: 'nestjs',
      MATCHING_ENGINE: 'ts',
      PUBLIC_WS_SOURCE: 'nestjs',
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        GoRolloutReadinessService,
        { provide: ConfigService, useValue: { get: (key: string) => configValues[key] } },
        { provide: DataSource, useValue: { query: jest.fn().mockResolvedValue([]) } },
        {
          provide: MarketReadModelReconciliationService,
          useValue: {
            getProjectionHealth: jest.fn().mockResolvedValue({
              status: 'up',
              lag: {
                trades: { lagSeconds: 0 },
                tickers: { lagSeconds: 0 },
                ohlcv: { lagSeconds: 0 },
              },
            }),
          },
        },
        {
          provide: PublicWsPayloadParityService,
          useValue: {
            getReport: jest.fn().mockReturnValue({
              ticker: { contractValid: true },
              ohlc: { contractValid: true },
              goAggregatorParity: { comparedPairs: 0, driftPairs: 0 },
            }),
          },
        },
      ],
    }).compile();

    const service = moduleRef.get(GoRolloutReadinessService);
    const output = await service.snapshotReadiness('tester');

    const list = await service.listSnapshots(1);
    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(list[0].outputFile).toContain('reports/go-rollout/');

    const latest = await service.getLatestSnapshot();
    expect(latest).not.toBeNull();
    expect(latest?.reportAt).toBe(output.reportAt);
  });
