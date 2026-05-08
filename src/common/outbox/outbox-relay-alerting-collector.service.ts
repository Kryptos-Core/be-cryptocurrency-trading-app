import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RedisService } from '@/common/services/redis.service';
import { MetricsService } from '@/telemetry/metrics.service';
import { OutboxAdminService } from './outbox-admin.service';
import {
  OUTBOX_ALERTS_CHANNEL_DEFAULT,
  OutboxRelayAlertSeverity,
  OutboxRelayAlertStateChangedEvent,
} from './outbox-alerting.constants';

@Injectable()
export class OutboxRelayAlertingCollectorService {
  private readonly logger = new Logger(OutboxRelayAlertingCollectorService.name);
  private previousSeverity: OutboxRelayAlertSeverity = 'none';

  constructor(
    private readonly outboxAdminService: OutboxAdminService,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
    private readonly metricsService: MetricsService,
  ) {}

  @Cron(CronExpression.EVERY_30_SECONDS, { name: 'outbox-relay-alerting-collector' })
  async collect(): Promise<void> {
    const driver =
      String(this.configService.get<string>('EVENT_PUBLISHER_DRIVER') ?? 'noop')
        .trim()
        .toLowerCase() || 'noop';

    // Noop driver means events are not actually published, skip alerting
    if (driver === 'noop') {
      return;
    }

    const enabled =
      String(this.configService.get<string>('EVENT_OUTBOX_ALERT_AUTOMATION_ENABLED') ?? 'true')
        .trim()
        .toLowerCase() !== 'false';
    if (!enabled) {
      return;
    }

    try {
      const health = await this.outboxAdminService.getRelayHealth();
      const severity = health.alerts.severity;

      this.metricsService.setOutboxRelayAlertSeverity(this.severityToMetric(severity));

      if (severity !== this.previousSeverity) {
        const reasons = this.resolveReasons(health);
        const payload: OutboxRelayAlertStateChangedEvent = {
          event: 'outbox.relay.alert_state_changed',
          checkedAt: new Date().toISOString(),
          previousSeverity: this.previousSeverity,
          currentSeverity: severity,
          publisherDriver: driver,
          reasons,
          health: {
            unpublishedBacklog: health.unpublishedBacklog,
            deadLetterRows: health.deadLetterRows,
            retryScheduledRows: health.retryScheduledRows,
            oldestUnpublishedAgeSeconds: health.oldestUnpublishedAgeSeconds,
            oldestDeadLetterAgeSeconds: health.oldestDeadLetterAgeSeconds,
          },
          thresholds: health.thresholds,
        };

        this.logStateTransition(payload);
        await this.publishAlertEvent(payload);
      }

      this.previousSeverity = severity;
    } catch (error) {
      this.logger.warn(
        `Outbox relay alerting collector failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private resolveReasons(
    health: Awaited<ReturnType<OutboxAdminService['getRelayHealth']>>,
  ): string[] {
    const reasons: string[] = [];

    if (health.alerts.deadLetterRowsCritical) {
      reasons.push('dead_letter_rows_critical');
    } else if (health.alerts.deadLetterRowsExceeded) {
      reasons.push('dead_letter_rows_warning');
    }

    if (health.alerts.oldestUnpublishedAgeCritical) {
      reasons.push('oldest_unpublished_age_critical');
    } else if (health.alerts.oldestUnpublishedAgeExceeded) {
      reasons.push('oldest_unpublished_age_warning');
    }

    if (health.alerts.oldestDeadLetterAgeCritical) {
      reasons.push('oldest_dead_letter_age_critical');
    } else if (health.alerts.oldestDeadLetterAgeExceeded) {
      reasons.push('oldest_dead_letter_age_warning');
    }

    if (reasons.length === 0) {
      reasons.push('recovered');
    }

    return reasons;
  }

  private logStateTransition(payload: OutboxRelayAlertStateChangedEvent): void {
    const summary =
      `Outbox relay alert severity changed ${payload.previousSeverity} -> ${payload.currentSeverity} ` +
      `driver=${payload.publisherDriver} reasons=${payload.reasons.join(',')} ` +
      `deadLetterRows=${payload.health.deadLetterRows} ` +
      `oldestUnpublishedAge=${payload.health.oldestUnpublishedAgeSeconds}s ` +
      `oldestDeadLetterAge=${payload.health.oldestDeadLetterAgeSeconds}s`;

    if (payload.currentSeverity === 'critical') {
      this.logger.error(summary);
      return;
    }

    if (payload.currentSeverity === 'warning') {
      this.logger.warn(summary);
      return;
    }

    this.logger.log(summary);
  }

  private severityToMetric(severity: OutboxRelayAlertSeverity): number {
    if (severity === 'critical') return 2;
    if (severity === 'warning') return 1;
    return 0;
  }

  private async publishAlertEvent(payload: OutboxRelayAlertStateChangedEvent): Promise<void> {
    const channel =
      this.configService.get<string>('EVENT_OUTBOX_ALERTS_CHANNEL')?.trim() ||
      OUTBOX_ALERTS_CHANNEL_DEFAULT;

    try {
      await this.redisService.publish(channel, JSON.stringify(payload));
    } catch (error) {
      this.logger.warn(
        `[OutboxRelayAlerting] publish failed channel=${channel} reason=${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
