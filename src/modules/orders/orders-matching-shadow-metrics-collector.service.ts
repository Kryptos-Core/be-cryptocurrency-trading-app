import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ReconcileMatchingForPairUseCase } from './application/use-cases/reconcile-matching-for-pair.use-case';

@Injectable()
export class OrdersMatchingShadowMetricsCollectorService {
  private readonly logger = new Logger(OrdersMatchingShadowMetricsCollectorService.name);

  constructor(
    private readonly reconcileMatchingForPairUseCase: ReconcileMatchingForPairUseCase,
    private readonly configService: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async collect(): Promise<void> {
    const pairIds = this.getMonitorPairs();
    if (pairIds.length === 0) {
      return;
    }

    const minMatchRatePercent = Number(
      this.configService.get<string>('MATCHING_SHADOW_ALERT_MIN_MATCH_RATE_PERCENT') ?? '99.9',
    );
    const maxUnmatchedRuns = Number(
      this.configService.get<string>('MATCHING_SHADOW_ALERT_MAX_UNMATCHED_RUNS') ?? '0',
    );

    for (const pairId of pairIds) {
      try {
        const summary = await this.reconcileMatchingForPairUseCase.shadowParity(pairId, 24, 20);

        if (
          summary.matchRatePercent < minMatchRatePercent ||
          summary.unmatchedShadowRuns > maxUnmatchedRuns
        ) {
          this.logger.warn(
            `Shadow parity alert pair=${summary.pairId} matchRate=${summary.matchRatePercent.toFixed(2)} threshold=${minMatchRatePercent} unmatchedRuns=${summary.unmatchedShadowRuns} maxAllowed=${maxUnmatchedRuns}`,
          );
        }
      } catch (error) {
        this.logger.warn(
          `Failed to collect shadow parity metrics for pair=${pairId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  private getMonitorPairs(): string[] {
    const explicitPairs = this.parseCsv(this.configService.get<string>('MATCHING_SHADOW_MONITOR_PAIRS'));
    if (explicitPairs.length > 0) {
      return explicitPairs;
    }

    const mode = (this.configService.get<string>('MATCHING_ENGINE') ?? 'ts').trim().toLowerCase();
    if (mode === 'go_canary') {
      return this.parseCsv(this.configService.get<string>('MATCHING_GO_CANARY_PAIRS'));
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
}
