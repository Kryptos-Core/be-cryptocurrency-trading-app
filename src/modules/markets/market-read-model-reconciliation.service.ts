import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { ReadMarketOhlcv } from '@/entities/read-market-ohlcv.entity';
import { ReadMarketTicker } from '@/entities/read-market-ticker.entity';
import { ReadMarketTrade } from '@/entities/read-market-trade.entity';
import { MetricsService } from '@/telemetry';

export type TradeReconciliationReport = {
  coreCount: number;
  readModelCount: number;
  missingTrades: string[];
  drift: number;
  windowHours: number;
};

export type TickerReconciliationReport = {
  corePairs: number;
  readModelPairs: number;
  missingPairs: string[];
  stalePairs: string[];
  drift: number;
  windowHours: number;
};

export type OhlcvReconciliationReport = {
  intervalSec: number;
  windowHours: number;
  coreCandles: number;
  readModelCandles: number;
  missingCandles: string[];
  staleCandles: string[];
  drift: number;
};

export type ProjectionLagSummary = {
  projection: 'trades' | 'tickers' | 'ohlcv';
  lagSeconds: number;
  latestCoreAt: string | null;
  latestProjectionAt: string | null;
};

export type ProjectionHealthSummary = {
  status: 'up' | 'degraded';
  checkedAt: string;
  windowHours: number;
  trades: TradeReconciliationReport;
  tickers: TickerReconciliationReport;
  ohlcv: OhlcvReconciliationReport[];
  lag: {
    trades: ProjectionLagSummary;
    tickers: ProjectionLagSummary;
    ohlcv: ProjectionLagSummary;
  };
};

@Injectable()
export class MarketReadModelReconciliationService {
  private readonly logger = new Logger(MarketReadModelReconciliationService.name);
  private readonly defaultOhlcvIntervals = [60, 300, 900, 3600, 14400, 86400] as const;

  constructor(
    private readonly dataSource: DataSource,
    @Optional() private readonly metricsService?: MetricsService,
  ) {}

  getDefaultOhlcvIntervals(): number[] {
    return [...this.defaultOhlcvIntervals];
  }

  async reconcileTrades(windowHours = 24): Promise<TradeReconciliationReport> {
    const coreRows = (await this.dataSource.query(
      `SELECT trade_id
         FROM trades
        WHERE created_at >= NOW() - ($1::text || ' hours')::interval
        ORDER BY created_at DESC`,
      [String(windowHours)],
    )) as Array<{ trade_id: string }>;

    const readRows = await this.dataSource
      .getRepository(ReadMarketTrade)
      .createQueryBuilder('t')
      .where(`t.executed_at >= NOW() - (:hours || ' hours')::interval`, {
        hours: String(windowHours),
      })
      .orderBy('t.executed_at', 'DESC')
      .getMany();

    const coreIds = new Set<string>((coreRows ?? []).map((row) => row.trade_id));
    const readIds = new Set<string>(readRows.map((row) => row.trade_id));
    const missingTrades = Array.from(coreIds)
      .filter((id: string) => !readIds.has(id))
      .slice(0, 100);

    return {
      coreCount: coreIds.size,
      readModelCount: readIds.size,
      missingTrades,
      drift: coreIds.size - readIds.size,
      windowHours,
    };
  }

  async reconcileTickers(windowHours = 24): Promise<TickerReconciliationReport> {
    const coreRows = (await this.dataSource.query(
      `SELECT pair_id, MAX(created_at) AS last_trade_at
         FROM trades
        WHERE created_at >= NOW() - ($1::text || ' hours')::interval
        GROUP BY pair_id`,
      [String(windowHours)],
    )) as Array<{ pair_id: string; last_trade_at: string | Date }>;

    const readRows = await this.dataSource.getRepository(ReadMarketTicker).find();
    const readByPair = new Map(readRows.map((row) => [row.pair_id, row]));

    const missingPairs: string[] = [];
    const stalePairs: string[] = [];
    for (const row of coreRows) {
      const projected = readByPair.get(row.pair_id);
      if (!projected) {
        missingPairs.push(row.pair_id);
        continue;
      }
      const coreTime = new Date(row.last_trade_at).getTime();
      const readTime = new Date(projected.ticker_timestamp).getTime();
      if (readTime + 60_000 < coreTime) {
        stalePairs.push(row.pair_id);
      }
    }

    return {
      corePairs: coreRows.length,
      readModelPairs: readRows.length,
      missingPairs: missingPairs.slice(0, 100),
      stalePairs: stalePairs.slice(0, 100),
      drift: coreRows.length - readRows.length,
      windowHours,
    };
  }

  async reconcileOhlcv(windowHours = 24, intervalSec = 60): Promise<OhlcvReconciliationReport> {
    const coreRows = (await this.dataSource.query(
      `WITH core_candles AS (
         SELECT
           pair_id,
           to_timestamp(FLOOR(EXTRACT(EPOCH FROM created_at) / $2) * $2) AS open_time,
           MAX(created_at) AS last_trade_at
         FROM trades
         WHERE created_at >= NOW() - ($1::text || ' hours')::interval
         GROUP BY pair_id, to_timestamp(FLOOR(EXTRACT(EPOCH FROM created_at) / $2) * $2)
       )
       SELECT pair_id, open_time, last_trade_at
       FROM core_candles
       ORDER BY open_time DESC`,
      [String(windowHours), intervalSec],
    )) as Array<{ pair_id: string; open_time: string | Date; last_trade_at: string | Date }>;

    const readRows = await this.dataSource
      .getRepository(ReadMarketOhlcv)
      .createQueryBuilder('o')
      .where('o.interval_sec = :intervalSec', { intervalSec })
      .andWhere(`o.open_time >= NOW() - (:hours || ' hours')::interval`, {
        hours: String(windowHours),
      })
      .orderBy('o.open_time', 'DESC')
      .getMany();

    const readByKey = new Map(
      readRows.map((row) => [this.buildOhlcvKey(row.pair_id, row.open_time), row]),
    );

    const missingCandles: string[] = [];
    const staleCandles: string[] = [];

    for (const row of coreRows) {
      const key = this.buildOhlcvKey(row.pair_id, row.open_time);
      const projected = readByKey.get(key);
      if (!projected) {
        missingCandles.push(key);
        continue;
      }

      const coreLastTradeMs = new Date(row.last_trade_at).getTime();
      const projectedCloseBoundaryMs = projected.open_time.getTime() + intervalSec * 1000;
      if (projectedCloseBoundaryMs + 1000 < coreLastTradeMs) {
        staleCandles.push(key);
      }
    }

    return {
      intervalSec,
      windowHours,
      coreCandles: coreRows.length,
      readModelCandles: readRows.length,
      missingCandles: missingCandles.slice(0, 100),
      staleCandles: staleCandles.slice(0, 100),
      drift: coreRows.length - readRows.length,
    };
  }

  async reconcileOhlcvIntervals(
    windowHours = 24,
    intervalSecs: number[] = this.getDefaultOhlcvIntervals(),
  ): Promise<OhlcvReconciliationReport[]> {
    const normalizedIntervals = this.normalizeIntervals(intervalSecs);
    return Promise.all(normalizedIntervals.map((intervalSec) => this.reconcileOhlcv(windowHours, intervalSec)));
  }

  async getProjectionLagSummary(): Promise<ProjectionHealthSummary['lag']> {
    const [tradeLag, tickerLag, ohlcvLag] = await Promise.all([
      this.getProjectionLag(
        'trades',
        `SELECT MAX(created_at) AS latest_core_at FROM trades`,
        `SELECT MAX(executed_at) AS latest_projection_at FROM read_market_trades`,
      ),
      this.getProjectionLag(
        'tickers',
        `SELECT MAX(created_at) AS latest_core_at FROM trades`,
        `SELECT MAX(ticker_timestamp) AS latest_projection_at FROM read_market_tickers`,
      ),
      this.getProjectionLag(
        'ohlcv',
        `SELECT MAX(created_at) AS latest_core_at FROM trades`,
        `SELECT MAX(open_time) + INTERVAL '1 minute' AS latest_projection_at FROM read_market_ohlcv WHERE interval_sec = 60`,
      ),
    ]);

    return {
      trades: tradeLag,
      tickers: tickerLag,
      ohlcv: ohlcvLag,
    };
  }

  async getProjectionHealth(
    windowHours = 24,
    ohlcvIntervals: number[] = this.getDefaultOhlcvIntervals(),
  ): Promise<ProjectionHealthSummary> {
    const normalizedIntervals = this.normalizeIntervals(ohlcvIntervals);
    const [trades, tickers, ohlcv, lag] = await Promise.all([
      this.reconcileTrades(windowHours),
      this.reconcileTickers(windowHours),
      this.reconcileOhlcvIntervals(windowHours, normalizedIntervals),
      this.getProjectionLagSummary(),
    ]);

    const degradedOhlcv = ohlcv.some(
      (report) =>
        report.drift !== 0 ||
        report.missingCandles.length > 0 ||
        report.staleCandles.length > 0,
    );

    const degraded =
      trades.drift !== 0 ||
      trades.missingTrades.length > 0 ||
      tickers.drift !== 0 ||
      tickers.missingPairs.length > 0 ||
      tickers.stalePairs.length > 0 ||
      degradedOhlcv ||
      lag.trades.lagSeconds > 300 ||
      lag.tickers.lagSeconds > 300 ||
      lag.ohlcv.lagSeconds > 300;

    return {
      status: degraded ? 'degraded' : 'up',
      checkedAt: new Date().toISOString(),
      windowHours,
      trades,
      tickers,
      ohlcv,
      lag,
    };
  }

  async collectMetrics(
    windowHours = 24,
    ohlcvIntervals: number[] = this.getDefaultOhlcvIntervals(),
  ): Promise<ProjectionHealthSummary> {
    const health = await this.getProjectionHealth(windowHours, ohlcvIntervals);
    this.publishMetrics(health);
    return health;
  }

  @Cron(CronExpression.EVERY_30_MINUTES)
  async logScheduledTradeReconciliation(): Promise<void> {
    try {
      const health = await this.getProjectionHealth(24);
      const tradeReport = health.trades;
      const tickerReport = health.tickers;
      const ohlcvIssues = health.ohlcv.filter(
        (report) =>
          report.drift !== 0 ||
          report.missingCandles.length > 0 ||
          report.staleCandles.length > 0,
      );

      if (tradeReport.drift !== 0 || tradeReport.missingTrades.length > 0) {
        this.logger.warn(
          `Market trade reconciliation drift=${tradeReport.drift} core=${tradeReport.coreCount} read=${tradeReport.readModelCount} missing=${tradeReport.missingTrades.length}`,
        );
      } else {
        this.logger.debug(
          `Market trade reconciliation ok core=${tradeReport.coreCount} read=${tradeReport.readModelCount}`,
        );
      }

      if (
        tickerReport.drift !== 0 ||
        tickerReport.missingPairs.length > 0 ||
        tickerReport.stalePairs.length > 0
      ) {
        this.logger.warn(
          `Market ticker reconciliation drift=${tickerReport.drift} corePairs=${tickerReport.corePairs} readPairs=${tickerReport.readModelPairs} missing=${tickerReport.missingPairs.length} stale=${tickerReport.stalePairs.length}`,
        );
      } else {
        this.logger.debug(
          `Market ticker reconciliation ok corePairs=${tickerReport.corePairs} readPairs=${tickerReport.readModelPairs}`,
        );
      }

      if (ohlcvIssues.length > 0) {
        const summary = ohlcvIssues
          .map(
            (report) =>
              `interval=${report.intervalSec}s drift=${report.drift} missing=${report.missingCandles.length} stale=${report.staleCandles.length}`,
          )
          .join('; ');
        this.logger.warn(`Market OHLCV reconciliation issues ${summary}`);
      } else {
        this.logger.debug(
          `Market OHLCV reconciliation ok intervals=${health.ohlcv.map((report) => report.intervalSec).join(',')}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Market read-model reconciliation failed: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  private async getProjectionLag(
    projection: ProjectionLagSummary['projection'],
    coreQuery: string,
    projectionQuery: string,
  ): Promise<ProjectionLagSummary> {
    const [coreRows, projectionRows] = await Promise.all([
      this.dataSource.query(coreQuery),
      this.dataSource.query(projectionQuery),
    ]);

    const latestCoreAt = this.toIsoString(coreRows?.[0]?.latest_core_at ?? null);
    const latestProjectionAt = this.toIsoString(projectionRows?.[0]?.latest_projection_at ?? null);
    const lagSeconds = this.calculateLagSeconds(latestCoreAt, latestProjectionAt);

    return {
      projection,
      lagSeconds,
      latestCoreAt,
      latestProjectionAt,
    };
  }

  private publishMetrics(health: ProjectionHealthSummary): void {
    if (!this.metricsService) return;

    this.metricsService.setMarketReadModelTradeDrift(
      health.trades.windowHours,
      health.trades.drift,
    );
    this.metricsService.setMarketReadModelTickerDrift(
      health.tickers.windowHours,
      health.tickers.drift,
    );
    this.metricsService.setMarketReadModelTickerStalePairs(
      health.tickers.windowHours,
      health.tickers.stalePairs.length,
    );

    for (const report of health.ohlcv) {
      this.metricsService.setMarketReadModelOhlcvDrift(
        report.windowHours,
        report.intervalSec,
        report.drift,
      );
    }

    this.metricsService.setMarketReadModelProjectionLagSeconds(
      'trades',
      health.lag.trades.lagSeconds,
    );
    this.metricsService.setMarketReadModelProjectionLagSeconds(
      'tickers',
      health.lag.tickers.lagSeconds,
    );
    this.metricsService.setMarketReadModelProjectionLagSeconds(
      'ohlcv',
      health.lag.ohlcv.lagSeconds,
    );
  }

  private normalizeIntervals(intervalSecs: number[]): number[] {
    const normalized = Array.from(
      new Set(
        intervalSecs
          .map((value) => Number(value))
          .filter((value) => Number.isInteger(value) && value > 0),
      ),
    ).sort((a, b) => a - b);

    return normalized.length > 0 ? normalized : this.getDefaultOhlcvIntervals();
  }

  private buildOhlcvKey(pairId: string, openTime: string | Date): string {
    return `${pairId}:${new Date(openTime).toISOString()}`;
  }

  private toIsoString(value: string | Date | null): string | null {
    if (!value) return null;
    return new Date(value).toISOString();
  }

  private calculateLagSeconds(
    latestCoreAt: string | null,
    latestProjectionAt: string | null,
  ): number {
    if (!latestCoreAt || !latestProjectionAt) return 0;
    const lagMs = new Date(latestCoreAt).getTime() - new Date(latestProjectionAt).getTime();
    return lagMs > 0 ? Math.floor(lagMs / 1000) : 0;
  }
}
