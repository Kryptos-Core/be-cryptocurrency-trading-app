import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ReconciliationService } from './reconciliation.service';

/**
 * Reconciliation Scheduler
 *
 * Phase 10: Reconciliation Jobs
 *
 * Runs reconciliation jobs at configured intervals:
 * - Balance drift: every 5 minutes
 * - Trades mismatch: every 5 minutes
 * - Outbox/Kafka: every 1 minute
 * - Orderbook checksum: every 10 minutes
 * - OHLCV consistency: every 1 minute
 */
@Injectable()
export class ReconciliationScheduler {
  private readonly logger = new Logger(ReconciliationScheduler.name);

  constructor(private readonly reconciliationService: ReconciliationService) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async reconcileBalances(): Promise<void> {
    const start = Date.now();
    try {
      const result = await this.reconciliationService.reconcileBalances();
      const duration = Date.now() - start;
      this.logger.debug(
        `Balance reconciliation completed in ${duration}ms: driftCount=${result.driftCount} critical=${result.criticalDriftCount}`,
      );
    } catch (error) {
      this.logger.error(
        `Balance reconciliation failed: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async reconcileTrades(): Promise<void> {
    const start = Date.now();
    try {
      const result = await this.reconciliationService.reconcileTrades(5);
      const duration = Date.now() - start;
      this.logger.debug(
        `Trades reconciliation completed in ${duration}ms: window=5m pg=${result.pgCount} read=${result.readCount} mismatch=${result.mismatch}`,
      );
    } catch (error) {
      this.logger.error(
        `Trades reconciliation failed: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async reconcileOutboxKafka(): Promise<void> {
    const start = Date.now();
    try {
      const result = await this.reconciliationService.reconcileOutboxVsKafka();
      const duration = Date.now() - start;
      this.logger.debug(
        `Outbox/Kafka reconciliation completed in ${duration}ms: unpublished=${result.unpublishedCount} dlq=${result.dlqCount}`,
      );
    } catch (error) {
      this.logger.error(
        `Outbox/Kafka reconciliation failed: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  @Cron('0 */10 * * * *') // Every 10 minutes
  async reconcileOrderbook(): Promise<void> {
    const start = Date.now();
    try {
      const result = await this.reconciliationService.reconcileOrderbook();
      const duration = Date.now() - start;
      this.logger.debug(
        `Orderbook checksum completed in ${duration}ms: checkedPairs=${result.checkedPairs} mismatched=${result.mismatchedPairs}`,
      );
    } catch (error) {
      this.logger.error(
        `Orderbook checksum failed: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async reconcileOhlcv(): Promise<void> {
    const start = Date.now();
    try {
      const results = await this.reconciliationService.reconcileOhlcv(60);
      const duration = Date.now() - start;
      const driftSummary = results
        .map((r) => `interval=${r.intervalSec}s drift=${(r.driftPercent * 100).toFixed(4)}%`)
        .join('; ');
      this.logger.debug(
        `OHLCV consistency completed in ${duration}ms: ${driftSummary}`,
      );
    } catch (error) {
      this.logger.error(
        `OHLCV consistency check failed: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
