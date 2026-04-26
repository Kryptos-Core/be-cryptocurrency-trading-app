import { promises as fs } from 'node:fs';
import * as path from 'node:path';
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
      GO_ROLLOUT_MIN_PUBLIC_WS_COMPARED_PAIRS: '1',
      GO_ROLLOUT_ROLLBACK_DRILL_MAX_AGE_HOURS: '72',
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
    expect(report.blockers).toContain('rollback_drill_stale_or_missing');
  });

  it('lists snapshots and returns latest snapshot', async () => {
    const configValues: Record<string, string> = {
      GO_ROLLOUT_WINDOW_HOURS: '24',
      MATCHING_SHADOW_ALERT_MIN_MATCH_RATE_PERCENT: '99.9',
      MATCHING_SHADOW_ALERT_MAX_UNMATCHED_RUNS: '0',
      GO_ROLLOUT_MAX_PUBLIC_WS_DRIFT_PAIRS: '0',
      GO_ROLLOUT_MIN_PUBLIC_WS_COMPARED_PAIRS: '0',
      GO_ROLLOUT_ROLLBACK_DRILL_MAX_AGE_HOURS: '10000',
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

  it('records and returns rollback drill evidence', async () => {
    const configValues: Record<string, string> = {
      GO_ROLLOUT_WINDOW_HOURS: '24',
      MATCHING_SHADOW_ALERT_MIN_MATCH_RATE_PERCENT: '99.9',
      MATCHING_SHADOW_ALERT_MAX_UNMATCHED_RUNS: '0',
      GO_ROLLOUT_MAX_PUBLIC_WS_DRIFT_PAIRS: '0',
      GO_ROLLOUT_MIN_PUBLIC_WS_COMPARED_PAIRS: '0',
      GO_ROLLOUT_ROLLBACK_DRILL_MAX_AGE_HOURS: '10000',
      MATCHING_GO_CANARY_PAIRS: '',
      MATCHING_SHADOW_MONITOR_PAIRS: '',
      TICKER_SOURCE: 'go_aggregator',
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
              goAggregatorParity: { comparedPairs: 2, driftPairs: 0 },
            }),
          },
        },
      ],
    }).compile();

    const service = moduleRef.get(GoRolloutReadinessService);

    const drill = await service.recordRollbackDrill({
      actorUserId: 'admin-user',
      fromSource: 'go_aggregator',
      toSource: 'nestjs',
      success: true,
      notes: 'phase5 rollback dry run',
    });

    expect(drill.fromSource).toBe('go_aggregator');
    expect(drill.toSource).toBe('nestjs');
    expect(drill.success).toBe(true);

    const latest = await service.getLatestRollbackDrill();
    expect(latest).not.toBeNull();
    expect(latest?.actorUserId).toBe('admin-user');

    const report = await service.getReadiness();
    expect(report.rollbackDrill.latest).not.toBeNull();
    expect(report.rollbackDrill.withinSla).toBe(true);
  });
});

afterAll(async () => {
  const rollbackFile = path.join(process.cwd(), 'reports', 'go-rollout', 'rollback-drills.json');
  try {
    await fs.unlink(rollbackFile);
  } catch {
  }
});
