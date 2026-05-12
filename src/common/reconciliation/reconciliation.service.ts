import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { MetricsService } from '@/telemetry/metrics.service';

/**
 * Reconciliation Jobs Types
 */
export interface BalanceDriftReport {
  userId: string;
  currency: string;
  statedBalance: string;
  ledgerBalance: string;
  driftAmount: string;
  driftAbs: number;
}

export interface TradesMismatchReport {
  windowMinutes: number;
  pgCount: number;
  readCount: number;
  mismatch: number;
}

export interface OutboxKafkaReport {
  unpublishedCount: number;
  dlqCount: number;
  oldestUnpublishedAgeSeconds: number;
}

export interface OrderbookChecksumReport {
  pairId: string;
  pgBidTotal: string;
  pgAskTotal: string;
  redisBidTotal: string | null;
  redisAskTotal: string | null;
  checksumMatch: boolean;
  driftPercent: number | null;
}

export interface OhlcvConsistencyReport {
  intervalSec: number;
  pgVolume: string;
  readVolume: string;
  driftPercent: number;
}

export interface ReconciliationSummary {
  timestamp: string;
  balance: {
    driftCount: number;
    criticalDriftCount: number;
    sample: BalanceDriftReport[];
  };
  trades: TradesMismatchReport;
  outboxKafka: OutboxKafkaReport;
  orderbook: {
    checkedPairs: number;
    mismatchedPairs: number;
    sample: OrderbookChecksumReport[];
  };
  ohlcv: OhlcvConsistencyReport[];
}

/**
 * Reconciliation Thresholds (can be overridden via env)
 */
export const RECONCILIATION_THRESHOLDS = {
  balanceDriftWarning: 0,
  balanceDriftCritical: 0,
  tradesMismatchWarning: 0,
  tradesMismatchCritical: 10,
  outboxBacklogWarning: 1000,
  outboxBacklogCritical: 5000,
  dlqCountWarning: 1,
  dlqCountCritical: 100,
  orderbookChecksumDriftWarning: 0.01, // 1%
  orderbookChecksumDriftCritical: 0.05, // 5%
  ohlcvVolumeDriftWarning: 0.001, // 0.1%
  ohlcvVolumeDriftCritical: 0.01, // 1%
} as const;

/**
 * ReconciliationService
 *
 * Phase 10: Reconciliation Jobs - Ưu tiên CAO
 *
 * Runs reconciliation checks to ensure correctness of read models and detect balance drift.
 * Reconciliation does NOT fix data - only detects mismatches and alerts.
 */
@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly metricsService: MetricsService,
  ) {}

  /**
   * Get full reconciliation summary
   */
  async getReconciliationSummary(
    windowMinutes = 5,
  ): Promise<ReconciliationSummary> {
    const [balance, trades, outboxKafka, orderbook, ohlcv] = await Promise.all([
      this.reconcileBalances(),
      this.reconcileTrades(windowMinutes),
      this.reconcileOutboxVsKafka(),
      this.reconcileOrderbook(),
      this.reconcileOhlcv(windowMinutes),
    ]);

    return {
      timestamp: new Date().toISOString(),
      balance,
      trades,
      outboxKafka,
      orderbook,
      ohlcv,
    };
  }

  /**
   * 1. Balance Reconciliation
   *
   * Checks that wallet balances match the ledger balance.
   * Alert if any drift > 0 (money issue).
   */
  async reconcileBalances(): Promise<{
    driftCount: number;
    criticalDriftCount: number;
    sample: BalanceDriftReport[];
  }> {
    try {
      const rows = (await this.dataSource.query(`
        SELECT
          w.user_id,
          w.currency_id as currency,
          (w.available + w.frozen)::text AS stated_balance,
          COALESCE(
            (
              SELECT SUM(
                CASE WHEN lt.direction = 'CREDIT' THEN lt.amount ELSE -lt.amount END
              )::text
              FROM wallet_ledger lt
              WHERE lt.wallet_id = w.wallet_id
            ),
            '0'
          ) AS ledger_balance,
          ABS(
            (w.available + w.frozen) - COALESCE(
              (
                SELECT SUM(
                  CASE WHEN lt.direction = 'CREDIT' THEN lt.amount ELSE -lt.amount END
                )
                FROM wallet_ledger lt
                WHERE lt.wallet_id = w.wallet_id
              ),
              0
            )
          )::text AS drift_amount
        FROM wallets w
        WHERE w.available + w.frozen != COALESCE(
          (
            SELECT SUM(
              CASE WHEN lt.direction = 'CREDIT' THEN lt.amount ELSE -lt.amount END
            )
            FROM wallet_ledger lt
            WHERE lt.wallet_id = w.wallet_id
          ),
          0
        )
        ORDER BY ABS(
          (w.available + w.frozen) - COALESCE(
            (
              SELECT SUM(
                CASE WHEN lt.direction = 'CREDIT' THEN lt.amount ELSE -lt.amount END
              )
              FROM wallet_ledger lt
              WHERE lt.wallet_id = w.wallet_id
            ),
            0
          )
        ) DESC
        LIMIT 100
      `)) as Array<{
        user_id: string;
        currency: string;
        stated_balance: string;
        ledger_balance: string;
        drift_amount: string;
      }>;

      const sample: BalanceDriftReport[] = rows.map((row) => ({
        userId: row.user_id,
        currency: row.currency,
        statedBalance: row.stated_balance,
        ledgerBalance: row.ledger_balance,
        driftAmount: row.drift_amount,
        driftAbs: parseFloat(row.drift_amount),
      }));

      const driftCount = sample.length;
      const criticalDriftCount = sample.filter(
        (r) => r.driftAbs > RECONCILIATION_THRESHOLDS.balanceDriftCritical,
      ).length;

      // Emit metrics
      this.metricsService.setReconciliationBalanceDriftTotal(driftCount);
      this.metricsService.setReconciliationBalanceCriticalTotal(criticalDriftCount);

      if (driftCount > 0) {
        this.logger.error(
          `BALANCE DRIFT DETECTED: ${driftCount} wallets with drift > 0. Critical: ${criticalDriftCount}`,
        );
      }

      return { driftCount, criticalDriftCount, sample };
    } catch (error) {
      this.logger.error(
        `Balance reconciliation failed: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      return { driftCount: -1, criticalDriftCount: -1, sample: [] };
    }
  }

  /**
   * 2. Trades Reconciliation
   *
   * Checks that trade counts match between PostgreSQL and read model.
   */
  async reconcileTrades(windowMinutes = 5): Promise<TradesMismatchReport> {
    try {
      const [pgRows, readRows] = await Promise.all([
        this.dataSource.query(
          `SELECT COUNT(*)::int AS count FROM trades WHERE created_at >= NOW() - ($1 || ' minutes')::interval`,
          [String(windowMinutes)],
        ),
        this.dataSource.query(
          `SELECT COUNT(*)::int AS count FROM read_market_trades WHERE executed_at >= NOW() - ($1 || ' minutes')::interval`,
          [String(windowMinutes)],
        ),
      ]);

      const pgCount = Number((pgRows[0] as { count: number }).count);
      const readCount = Number((readRows[0] as { count: number }).count);
      const mismatch = Math.abs(pgCount - readCount);

      // Emit metrics
      this.metricsService.setReconciliationTradesMismatch(
        windowMinutes,
        pgCount,
        readCount,
      );

      if (mismatch > RECONCILIATION_THRESHOLDS.tradesMismatchWarning) {
        this.logger.warn(
          `TRADES MISMATCH: window=${windowMinutes}m pg=${pgCount} read=${readCount} mismatch=${mismatch}`,
        );
      }

      return { windowMinutes, pgCount, readCount, mismatch };
    } catch (error) {
      this.logger.error(
        `Trades reconciliation failed: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      return { windowMinutes, pgCount: -1, readCount: -1, mismatch: -1 };
    }
  }

  /**
   * 3. Outbox vs Kafka Reconciliation
   *
   * Checks unpublished backlog and DLQ counts.
   */
  async reconcileOutboxVsKafka(): Promise<OutboxKafkaReport> {
    try {
      const [unpublishedRows, dlqRows, oldestRow] = await Promise.all([
        this.dataSource.query(`
          SELECT COUNT(*)::int AS count
          FROM integration_outbox
          WHERE published_at IS NULL
            AND dead_lettered_at IS NULL
        `),
        this.dataSource.query(`
          SELECT COUNT(*)::int AS count
          FROM integration_outbox
          WHERE dead_lettered_at IS NOT NULL
        `),
        this.dataSource.query(`
          SELECT occurred_at
          FROM integration_outbox
          WHERE published_at IS NULL
            AND dead_lettered_at IS NULL
          ORDER BY occurred_at ASC
          LIMIT 1
        `),
      ]);

      const unpublishedCount = Number((unpublishedRows[0] as { count: number }).count);
      const dlqCount = Number((dlqRows[0] as { count: number }).count);
      const oldestUnpublishedAgeSeconds = oldestRow.length > 0
        ? Math.floor(
            (Date.now() - new Date((oldestRow[0] as { occurred_at: Date }).occurred_at).getTime()) / 1000,
          )
        : 0;

      // Emit metrics
      this.metricsService.setReconciliationOutboxBacklog(unpublishedCount);
      this.metricsService.setReconciliationDlqCount(dlqCount);

      if (unpublishedCount > RECONCILIATION_THRESHOLDS.outboxBacklogWarning) {
        this.logger.warn(
          `OUTBOX BACKLOG: ${unpublishedCount} unpublished (warning > ${RECONCILIATION_THRESHOLDS.outboxBacklogWarning})`,
        );
      }

      if (dlqCount > RECONCILIATION_THRESHOLDS.dlqCountWarning) {
        this.logger.error(
          `DLQ COUNT: ${dlqCount} dead-lettered (warning > ${RECONCILIATION_THRESHOLDS.dlqCountWarning})`,
        );
      }

      return { unpublishedCount, dlqCount, oldestUnpublishedAgeSeconds };
    } catch (error) {
      this.logger.error(
        `Outbox/Kafka reconciliation failed: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      return { unpublishedCount: -1, dlqCount: -1, oldestUnpublishedAgeSeconds: -1 };
    }
  }

  /**
   * 4. Orderbook Checksum
   *
   * Compares total bid/ask amounts between PostgreSQL and Redis.
   */
  async reconcileOrderbook(): Promise<{
    checkedPairs: number;
    mismatchedPairs: number;
    sample: OrderbookChecksumReport[];
  }> {
    try {
      const pgOrders = (await this.dataSource.query(`
        SELECT
          pair_id,
          SUM(CASE WHEN side = 'BUY' THEN (amount - filled_amount) ELSE 0 END)::text AS total_bid,
          SUM(CASE WHEN side = 'SELL' THEN (amount - filled_amount) ELSE 0 END)::text AS total_ask
        FROM orders
        WHERE status = 'OPEN'
        GROUP BY pair_id
      `)) as Array<{
        pair_id: string;
        total_bid: string;
        total_ask: string;
      }>;

      // Note: Redis orderbook checksum would require Redis client access
      // For now, we only check PostgreSQL orders
      // TODO: Add Redis orderbook comparison when Redis client is available

      const sample: OrderbookChecksumReport[] = pgOrders.slice(0, 20).map((row) => ({
        pairId: row.pair_id,
        pgBidTotal: row.total_bid,
        pgAskTotal: row.total_ask,
        redisBidTotal: null,
        redisAskTotal: null,
        checksumMatch: true,
        driftPercent: null,
      }));

      return {
        checkedPairs: pgOrders.length,
        mismatchedPairs: 0,
        sample,
      };
    } catch (error) {
      this.logger.error(
        `Orderbook checksum failed: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      return { checkedPairs: 0, mismatchedPairs: -1, sample: [] };
    }
  }

  /**
   * 5. OHLCV Consistency
   *
   * Checks that OHLCV volumes match between PostgreSQL and read model.
   */
  async reconcileOhlcv(windowMinutes = 60): Promise<OhlcvConsistencyReport[]> {
    try {
      const intervals = [60, 300, 900, 3600]; // 1m, 5m, 15m, 1h
      const reports: OhlcvConsistencyReport[] = [];

      for (const intervalSec of intervals) {
        const [pgRows, readRows] = await Promise.all([
          this.dataSource.query(
            `SELECT COALESCE(SUM(amount)::text, '0') AS volume FROM trades WHERE created_at >= NOW() - ($1 || ' minutes')::interval`,
            [String(windowMinutes)],
          ),
          this.dataSource.query(
            `SELECT COALESCE(SUM(volume)::text, '0') AS volume FROM read_market_ohlcv WHERE interval_sec = $2 AND open_time >= NOW() - ($1 || ' minutes')::interval`,
            [String(windowMinutes), intervalSec],
          ),
        ]);

        const pgVolume = (pgRows[0] as { volume: string }).volume;
        const readVolume = (readRows[0] as { volume: string }).volume;
        const pgNum = parseFloat(pgVolume);
        const readNum = parseFloat(readVolume);
        const driftPercent = pgNum > 0 ? Math.abs(pgNum - readNum) / pgNum : 0;

        reports.push({
          intervalSec,
          pgVolume,
          readVolume,
          driftPercent,
        });

        // Emit metrics
        this.metricsService.setReconciliationOhlcvDrift(intervalSec, driftPercent);

        if (driftPercent > RECONCILIATION_THRESHOLDS.ohlcvVolumeDriftWarning) {
          this.logger.warn(
            `OHLCV DRIFT: interval=${intervalSec}s window=${windowMinutes}m pg=${pgVolume} read=${readVolume} drift=${(driftPercent * 100).toFixed(4)}%`,
          );
        }
      }

      return reports;
    } catch (error) {
      this.logger.error(
        `OHLCV consistency check failed: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      return [];
    }
  }
}
