import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MetricsService } from '@/telemetry';
import { PublicWsPayloadParityService } from './public-ws-payload-parity.service';

@Injectable()
export class TradingPublicWsMetricsCollectorService {
  private readonly logger = new Logger(TradingPublicWsMetricsCollectorService.name);

  constructor(
    private readonly publicWsPayloadParityService: PublicWsPayloadParityService,
    @Optional() private readonly metricsService?: MetricsService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  collect(): void {
    const report = this.publicWsPayloadParityService.getReport();

    if (this.metricsService) {
      this.metricsService.setPublicWsParityComparedPairs(
        report.source,
        report.goAggregatorParity.comparedPairs,
      );
      this.metricsService.setPublicWsParityDriftPairs(
        report.source,
        report.goAggregatorParity.driftPairs,
      );
    }

    if (!report.ticker.contractValid || !report.ohlc.contractValid) {
      this.logger.warn(
        `Public WS payload contract degraded source=${report.source} tickerValid=${report.ticker.contractValid} ohlcValid=${report.ohlc.contractValid}`,
      );
    }

    if (report.goAggregatorParity.driftPairs > 0) {
      this.logger.warn(
        `Public WS parity drift detected source=${report.source} driftPairs=${report.goAggregatorParity.driftPairs} comparedPairs=${report.goAggregatorParity.comparedPairs}`,
      );
    }
  }
}
