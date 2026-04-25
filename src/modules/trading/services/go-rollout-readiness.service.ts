import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { MarketReadModelReconciliationService } from '@/modules/markets/market-read-model-reconciliation.service';
import { PublicWsPayloadParityService } from './public-ws-payload-parity.service';

export type GoRolloutPairReadiness = {
  pairId: string;
  shadowRuns: number;
  matchedShadowRuns: number;
  unmatchedShadowRuns: number;
  matchRatePercent: number;
  ready: boolean;
};

export type GoRolloutReadinessSnapshot = {
  reportAt: string;
  actorUserId: string;
  outputFile: string;
  report: GoRolloutReadinessReport;
};

export type GoRolloutReadinessReport = {
  checkedAt: string;
  windowHours: number;
  flags: {
    tickerSource: string;
    matchingEngine: string;
    publicWsSource: string;
    canaryPairs: string[];
    monitorPairs: string[];
  };
  thresholds: {
    minMatchRatePercent: number;
    maxUnmatchedRuns: number;
    maxPublicWsDriftPairs: number;
  };
  marketReadModel: {
    status: 'up' | 'degraded';
    lag: {
      trades: number;
      tickers: number;
      ohlcv: number;
    };
  };
  publicWs: {
    contractValid: boolean;
    comparedPairs: number;
    driftPairs: number;
  };
  matchingShadow: {
    pairResults: GoRolloutPairReadiness[];
  };
  ready: boolean;
  blockers: string[];
};

@Injectable()
export class GoRolloutReadinessService {
  constructor(
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
    private readonly marketReadModelReconciliationService: MarketReadModelReconciliationService,
    private readonly publicWsPayloadParityService: PublicWsPayloadParityService,
  ) {}

  async getReadiness(): Promise<GoRolloutReadinessReport> {
    const checkedAt = new Date().toISOString();
    const windowHours = this.getNumber('GO_ROLLOUT_WINDOW_HOURS', 24);

    const minMatchRatePercent = this.getNumber('MATCHING_SHADOW_ALERT_MIN_MATCH_RATE_PERCENT', 99.9);
    const maxUnmatchedRuns = this.getNumber('MATCHING_SHADOW_ALERT_MAX_UNMATCHED_RUNS', 0);
    const maxPublicWsDriftPairs = this.getNumber('GO_ROLLOUT_MAX_PUBLIC_WS_DRIFT_PAIRS', 0);

    const canaryPairs = this.parseCsv(this.configService.get<string>('MATCHING_GO_CANARY_PAIRS'));
    const monitorPairs = this.resolveMonitorPairs(canaryPairs);

    const [marketReadModelHealth, publicWsParity, pairResults] = await Promise.all([
      this.marketReadModelReconciliationService.getProjectionHealth(windowHours),
      Promise.resolve(this.publicWsPayloadParityService.getReport()),
      this.collectPairResults(monitorPairs, windowHours, minMatchRatePercent, maxUnmatchedRuns),
    ]);

    const publicWsContractValid =
      publicWsParity.ticker.contractValid && publicWsParity.ohlc.contractValid;

    const blockers: string[] = [];

    if (marketReadModelHealth.status !== 'up') {
      blockers.push('market_read_model_degraded');
    }
    if (!publicWsContractValid) {
      blockers.push('public_ws_contract_invalid');
    }
    if (publicWsParity.goAggregatorParity.driftPairs > maxPublicWsDriftPairs) {
      blockers.push('public_ws_drift_exceeded');
    }
    if (pairResults.some((result) => !result.ready)) {
      blockers.push('matching_shadow_threshold_exceeded');
    }

    return {
      checkedAt,
      windowHours,
      flags: {
        tickerSource: this.getString('TICKER_SOURCE', 'nestjs'),
        matchingEngine: this.getString('MATCHING_ENGINE', 'ts'),
        publicWsSource: this.getString('PUBLIC_WS_SOURCE', 'nestjs'),
        canaryPairs,
        monitorPairs,
      },
      thresholds: {
        minMatchRatePercent,
        maxUnmatchedRuns,
        maxPublicWsDriftPairs,
      },
      marketReadModel: {
        status: marketReadModelHealth.status,
        lag: {
          trades: marketReadModelHealth.lag.trades.lagSeconds,
          tickers: marketReadModelHealth.lag.tickers.lagSeconds,
          ohlcv: marketReadModelHealth.lag.ohlcv.lagSeconds,
        },
      },
      publicWs: {
        contractValid: publicWsContractValid,
        comparedPairs: publicWsParity.goAggregatorParity.comparedPairs,
        driftPairs: publicWsParity.goAggregatorParity.driftPairs,
      },
      matchingShadow: {
        pairResults,
      },
      ready: blockers.length === 0,
      blockers,
    };
  }

  async listSnapshots(limit = 20): Promise<GoRolloutReadinessSnapshot[]> {
    const outputDir = path.join(process.cwd(), 'reports', 'go-rollout');

    let files: string[] = [];
    try {
      files = await fs.readdir(outputDir);
    } catch {
      return [];
    }

    const snapshots: GoRolloutReadinessSnapshot[] = [];

    for (const file of files.filter((value) => value.endsWith('.json'))) {
      const fullPath = path.join(outputDir, file);
      try {
        const raw = await fs.readFile(fullPath, 'utf8');
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
          continue;
        }

        for (const item of parsed) {
          const reportAt = String(item?.reportAt ?? '');
          const actorUserId = String(item?.actorUserId ?? 'unknown');
          const report = item?.report as GoRolloutReadinessReport | undefined;
          if (!reportAt || !report) {
            continue;
          }

          snapshots.push({
            reportAt,
            actorUserId,
            outputFile: path.join('reports', 'go-rollout', file).replace(/\\/g, '/'),
            report,
          });
        }
      } catch {
      }
    }

    return snapshots
      .sort((a, b) => b.reportAt.localeCompare(a.reportAt))
      .slice(0, Math.max(1, Math.min(limit, 200)));
  }

  async getLatestSnapshot(): Promise<GoRolloutReadinessSnapshot | null> {
    const [latest] = await this.listSnapshots(1);
    return latest ?? null;
  }

  async snapshotReadiness(actorUserId: string): Promise<{ outputFile: string; reportAt: string }> {
    const report = await this.getReadiness();
    const reportDate = new Date(report.checkedAt).toISOString().slice(0, 10);
    const outputDir = path.join(process.cwd(), 'reports', 'go-rollout');
    const outputFile = path.join(outputDir, `${reportDate}.json`);

    await fs.mkdir(outputDir, { recursive: true });

    let history: unknown[] = [];
    try {
      const existing = await fs.readFile(outputFile, 'utf8');
      const parsed = JSON.parse(existing);
      if (Array.isArray(parsed)) {
        history = parsed;
      }
    } catch {
      history = [];
    }

    history.push({
      reportAt: report.checkedAt,
      actorUserId,
      report,
    });

    await fs.writeFile(outputFile, JSON.stringify(history, null, 2), 'utf8');
    return { outputFile, reportAt: report.checkedAt };
  }

  private async collectPairResults(
    pairIds: string[],
    windowHours: number,
    minMatchRatePercent: number,
    maxUnmatchedRuns: number,
  ): Promise<GoRolloutPairReadiness[]> {
    const results: GoRolloutPairReadiness[] = [];

    for (const pairId of pairIds) {
      const rows = (await this.dataSource.query(
        `WITH shadow AS (
           SELECT order_id
             FROM shadow_matching_runs
            WHERE pair_id = $1
              AND created_at >= NOW() - ($2::text || ' hours')::interval
         ),
         matched_shadow AS (
           SELECT COUNT(*)::int AS matched_shadow_runs
             FROM shadow s
            WHERE EXISTS (
              SELECT 1
                FROM trades t
               WHERE t.pair_id = $1
                 AND t.taker_order_id = s.order_id
            )
         )
         SELECT
           (SELECT COUNT(*)::int FROM shadow) AS shadow_runs,
           (SELECT matched_shadow_runs FROM matched_shadow) AS matched_shadow_runs`,
        [pairId, String(windowHours)],
      )) as Array<{ shadow_runs: number; matched_shadow_runs: number }>;

      const shadowRuns = Number(rows?.[0]?.shadow_runs ?? 0);
      const matchedShadowRuns = Number(rows?.[0]?.matched_shadow_runs ?? 0);
      const unmatchedShadowRuns = Math.max(shadowRuns - matchedShadowRuns, 0);
      const matchRatePercent =
        shadowRuns === 0 ? 100 : Math.max(0, Math.min(100, (matchedShadowRuns / shadowRuns) * 100));

      const ready =
        matchRatePercent >= minMatchRatePercent && unmatchedShadowRuns <= maxUnmatchedRuns;

      results.push({
        pairId,
        shadowRuns,
        matchedShadowRuns,
        unmatchedShadowRuns,
        matchRatePercent,
        ready,
      });
    }

    return results;
  }

  private resolveMonitorPairs(canaryPairs: string[]): string[] {
    const explicit = this.parseCsv(this.configService.get<string>('MATCHING_SHADOW_MONITOR_PAIRS'));
    if (explicit.length > 0) {
      return explicit;
    }

    const mode = this.getString('MATCHING_ENGINE', 'ts').toLowerCase();
    if (mode === 'go_canary') {
      return canaryPairs;
    }

    return [];
  }

  private parseCsv(raw: string | undefined): string[] {
    if (!raw) return [];
    return raw
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
  }

  private getString(key: string, fallback: string): string {
    const value = this.configService.get<string>(key);
    if (!value?.trim()) return fallback;
    return value.trim();
  }

  private getNumber(key: string, fallback: number): number {
    const raw = this.configService.get<string>(key);
    const value = Number(raw ?? String(fallback));
    if (!Number.isFinite(value)) return fallback;
    return value;
  }
}
