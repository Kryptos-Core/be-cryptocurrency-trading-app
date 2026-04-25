import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MarketReadModelReconciliationService } from './market-read-model-reconciliation.service';

@Injectable()
export class MarketReadModelMetricsCollectorService {
  private readonly logger = new Logger(MarketReadModelMetricsCollectorService.name);

  constructor(
    private readonly marketReadModelReconciliationService: MarketReadModelReconciliationService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async collectProjectionMetrics(): Promise<void> {
    try {
      const health = await this.marketReadModelReconciliationService.collectMetrics(24);
      this.logger.debug(
        `Market read-model metrics refreshed status=${health.status} tradeLag=${health.lag.trades.lagSeconds}s tickerLag=${health.lag.tickers.lagSeconds}s ohlcvLag=${health.lag.ohlcv.lagSeconds}s`,
      );
    } catch (error) {
      this.logger.error(
        `Market read-model metrics collection failed: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
