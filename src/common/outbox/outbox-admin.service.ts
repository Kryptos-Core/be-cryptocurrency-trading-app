import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, MoreThan, Repository } from 'typeorm';
import { IntegrationOutbox } from '@/entities/integration-outbox.entity';
import { SystemConfigService } from '@/modules/system-config/system-config.service';
import { OutboxRelayAlertSeverity } from './outbox-alerting.constants';
import {
  OutboxReplayAuditRecord,
  OutboxReplayAuditRowSnapshot,
  OutboxReplayAuditService,
} from './outbox-replay-audit.service';

export type OutboxDeadLetterListItem = {
  id: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  occurredAt: string;
  publishAttempts: number;
  lastPublishError: string | null;
  nextRetryAt: string | null;
  deadLetteredAt: string | null;
  correlationId: string | null;
  causationId: string | null;
  partitionKey: string | null;
  kafkaTopic: string | null;
};

export type OutboxRelayHealthSummary = {
  unpublishedBacklog: number;
  deadLetterRows: number;
  retryScheduledRows: number;
  oldestUnpublishedAt: string | null;
  oldestDeadLetterAt: string | null;
  oldestUnpublishedAgeSeconds: number;
  oldestDeadLetterAgeSeconds: number;
  thresholds: {
    warning: {
      maxDeadLetterRows: number;
      maxOldestUnpublishedAgeSeconds: number;
      maxOldestDeadLetterAgeSeconds: number;
    };
    critical: {
      maxDeadLetterRows: number;
      maxOldestUnpublishedAgeSeconds: number;
      maxOldestDeadLetterAgeSeconds: number;
    };
  };
  alerts: {
    deadLetterRowsExceeded: boolean;
    oldestUnpublishedAgeExceeded: boolean;
    oldestDeadLetterAgeExceeded: boolean;
    deadLetterRowsCritical: boolean;
    oldestUnpublishedAgeCritical: boolean;
    oldestDeadLetterAgeCritical: boolean;
    severity: OutboxRelayAlertSeverity;
    degraded: boolean;
  };
};

export type OutboxRequeueContext = {
  actorUserId: string;
  actorRole: string;
  reason?: string | null;
};

@Injectable()
export class OutboxAdminService {
  constructor(
    @InjectRepository(IntegrationOutbox)
    private readonly outboxRepository: Repository<IntegrationOutbox>,
    private readonly configService: ConfigService,
    private readonly systemConfigService: SystemConfigService,
    private readonly outboxReplayAuditService: OutboxReplayAuditService,
  ) {}

  async listDeadLetterRows(limit = 100): Promise<OutboxDeadLetterListItem[]> {
    const rows = await this.outboxRepository.find({
      where: {
        published_at: IsNull(),
        dead_lettered_at: MoreThan(new Date('1970-01-01T00:00:00.000Z')),
      },
      order: {
        dead_lettered_at: 'DESC',
        occurred_at: 'DESC',
      },
      take: Math.max(1, Math.min(limit, 500)),
    });

    return rows.map((row) => this.toDeadLetterListItem(row));
  }

  async requeueDeadLetterRow(
    id: string,
    context: OutboxRequeueContext,
  ): Promise<{ id: string; requeued: boolean; auditId: string; auditOutputFile: string }> {
    const selectedRow = await this.outboxRepository.findOne({
      where: {
        id,
        published_at: IsNull(),
        dead_lettered_at: MoreThan(new Date('1970-01-01T00:00:00.000Z')),
      },
    });

    const result = await this.outboxRepository
      .createQueryBuilder()
      .update(IntegrationOutbox)
      .set({
        dead_lettered_at: null,
        next_retry_at: null,
        last_publish_error: null,
      })
      .where('id = :id', { id })
      .andWhere('published_at IS NULL')
      .andWhere('dead_lettered_at IS NOT NULL')
      .execute();

    const requeued = (result.affected ?? 0) > 0;
    const audit = await this.outboxReplayAuditService.record({
      action: 'requeue_one',
      actorUserId: context.actorUserId,
      actorRole: context.actorRole,
      reason: this.normalizeReason(context.reason),
      targetRowId: id,
      requestedLimit: null,
      selectedRowCount: selectedRow ? 1 : 0,
      requeuedRowCount: requeued ? 1 : 0,
      rowSnapshots: selectedRow ? [this.toReplaySnapshot(selectedRow)] : [],
    });

    return { id, requeued, auditId: audit.auditId, auditOutputFile: audit.outputFile };
  }

  async requeueAllDeadLetterRows(
    limit = 100,
    context: OutboxRequeueContext,
  ): Promise<{ requested: number; requeued: number; auditId: string; auditOutputFile: string }> {
    const boundedLimit = Math.max(1, Math.min(limit, 500));
    const rows = await this.outboxRepository.find({
      where: {
        published_at: IsNull(),
        dead_lettered_at: MoreThan(new Date('1970-01-01T00:00:00.000Z')),
      },
      order: { dead_lettered_at: 'DESC' },
      take: boundedLimit,
    });

    if (rows.length === 0) {
      const audit = await this.outboxReplayAuditService.record({
        action: 'requeue_bulk',
        actorUserId: context.actorUserId,
        actorRole: context.actorRole,
        reason: this.normalizeReason(context.reason),
        targetRowId: null,
        requestedLimit: boundedLimit,
        selectedRowCount: 0,
        requeuedRowCount: 0,
        rowSnapshots: [],
      });

      return { requested: 0, requeued: 0, auditId: audit.auditId, auditOutputFile: audit.outputFile };
    }

    const ids = rows.map((row) => row.id);
    const result = await this.outboxRepository
      .createQueryBuilder()
      .update(IntegrationOutbox)
      .set({
        dead_lettered_at: null,
        next_retry_at: null,
        last_publish_error: null,
      })
      .where('id IN (:...ids)', { ids })
      .andWhere('published_at IS NULL')
      .andWhere('dead_lettered_at IS NOT NULL')
      .execute();

    const requeued = result.affected ?? 0;
    const audit = await this.outboxReplayAuditService.record({
      action: 'requeue_bulk',
      actorUserId: context.actorUserId,
      actorRole: context.actorRole,
      reason: this.normalizeReason(context.reason),
      targetRowId: null,
      requestedLimit: boundedLimit,
      selectedRowCount: ids.length,
      requeuedRowCount: requeued,
      rowSnapshots: rows.map((row) => this.toReplaySnapshot(row)),
    });

    return {
      requested: ids.length,
      requeued,
      auditId: audit.auditId,
      auditOutputFile: audit.outputFile,
    };
  }

  async listReplayAudits(limit = 20): Promise<OutboxReplayAuditRecord[]> {
    return this.outboxReplayAuditService.list(limit);
  }

  async getRelayHealth(): Promise<OutboxRelayHealthSummary> {
    const [
      unpublishedBacklog,
      deadLetterRows,
      retryScheduledRows,
      oldestUnpublished,
      oldestDeadLetter,
      warningMaxDeadLetterRows,
      warningMaxOldestUnpublishedAgeSeconds,
      warningMaxOldestDeadLetterAgeSeconds,
      criticalMaxDeadLetterRows,
      criticalMaxOldestUnpublishedAgeSeconds,
      criticalMaxOldestDeadLetterAgeSeconds,
    ] = await Promise.all([
      this.outboxRepository.count({ where: { published_at: IsNull() } }),
      this.outboxRepository.count({
        where: {
          published_at: IsNull(),
          dead_lettered_at: MoreThan(new Date('1970-01-01T00:00:00.000Z')),
        },
      }),
      this.outboxRepository
        .createQueryBuilder('o')
        .where('o.published_at IS NULL')
        .andWhere('o.dead_lettered_at IS NULL')
        .andWhere('o.next_retry_at IS NOT NULL')
        .getCount(),
      this.outboxRepository.findOne({
        where: { published_at: IsNull() },
        order: { occurred_at: 'ASC' },
      }),
      this.outboxRepository.findOne({
        where: {
          published_at: IsNull(),
          dead_lettered_at: MoreThan(new Date('1970-01-01T00:00:00.000Z')),
        },
        order: { dead_lettered_at: 'ASC' },
      }),
      this.resolveThreshold('EVENT_OUTBOX_ALERT_MAX_DEAD_LETTER_ROWS', 0),
      this.resolveThreshold('EVENT_OUTBOX_ALERT_MAX_OLDEST_UNPUBLISHED_AGE_SECONDS', 300),
      this.resolveThreshold('EVENT_OUTBOX_ALERT_MAX_OLDEST_DEAD_LETTER_AGE_SECONDS', 60),
      this.resolveThreshold('EVENT_OUTBOX_ALERT_CRITICAL_MAX_DEAD_LETTER_ROWS', 10),
      this.resolveThreshold('EVENT_OUTBOX_ALERT_CRITICAL_MAX_OLDEST_UNPUBLISHED_AGE_SECONDS', 1800),
      this.resolveThreshold('EVENT_OUTBOX_ALERT_CRITICAL_MAX_OLDEST_DEAD_LETTER_AGE_SECONDS', 600),
    ]);

    const nowMs = Date.now();
    const oldestUnpublishedAt = oldestUnpublished?.occurred_at?.toISOString() ?? null;
    const oldestDeadLetterAt = oldestDeadLetter?.dead_lettered_at?.toISOString() ?? null;
    const oldestUnpublishedAgeSeconds = this.computeAgeSeconds(oldestUnpublished?.occurred_at, nowMs);
    const oldestDeadLetterAgeSeconds = this.computeAgeSeconds(oldestDeadLetter?.dead_lettered_at, nowMs);

    const deadLetterRowsExceeded = deadLetterRows > warningMaxDeadLetterRows;
    const oldestUnpublishedAgeExceeded =
      oldestUnpublishedAgeSeconds > warningMaxOldestUnpublishedAgeSeconds;
    const oldestDeadLetterAgeExceeded =
      oldestDeadLetterAgeSeconds > warningMaxOldestDeadLetterAgeSeconds;

    const deadLetterRowsCritical = deadLetterRows > criticalMaxDeadLetterRows;
    const oldestUnpublishedAgeCritical =
      oldestUnpublishedAgeSeconds > criticalMaxOldestUnpublishedAgeSeconds;
    const oldestDeadLetterAgeCritical =
      oldestDeadLetterAgeSeconds > criticalMaxOldestDeadLetterAgeSeconds;

    const severity: OutboxRelayAlertSeverity =
      deadLetterRowsCritical || oldestUnpublishedAgeCritical || oldestDeadLetterAgeCritical
        ? 'critical'
        : deadLetterRowsExceeded || oldestUnpublishedAgeExceeded || oldestDeadLetterAgeExceeded
          ? 'warning'
          : 'none';

    return {
      unpublishedBacklog,
      deadLetterRows,
      retryScheduledRows,
      oldestUnpublishedAt,
      oldestDeadLetterAt,
      oldestUnpublishedAgeSeconds,
      oldestDeadLetterAgeSeconds,
      thresholds: {
        warning: {
          maxDeadLetterRows: warningMaxDeadLetterRows,
          maxOldestUnpublishedAgeSeconds: warningMaxOldestUnpublishedAgeSeconds,
          maxOldestDeadLetterAgeSeconds: warningMaxOldestDeadLetterAgeSeconds,
        },
        critical: {
          maxDeadLetterRows: criticalMaxDeadLetterRows,
          maxOldestUnpublishedAgeSeconds: criticalMaxOldestUnpublishedAgeSeconds,
          maxOldestDeadLetterAgeSeconds: criticalMaxOldestDeadLetterAgeSeconds,
        },
      },
      alerts: {
        deadLetterRowsExceeded,
        oldestUnpublishedAgeExceeded,
        oldestDeadLetterAgeExceeded,
        deadLetterRowsCritical,
        oldestUnpublishedAgeCritical,
        oldestDeadLetterAgeCritical,
        severity,
        degraded: severity !== 'none',
      },
    };
  }

  private normalizeReason(reason: string | null | undefined): string | null {
    const trimmed = String(reason ?? '').trim();
    return trimmed.length > 0 ? trimmed.slice(0, 500) : null;
  }

  private async resolveThreshold(key: string, fallback: number): Promise<number> {
    const fromRuntime = await this.systemConfigService.get<string>(key);
    const fromEnv = this.configService.get<string>(key);
    const parsed = Number(fromRuntime ?? fromEnv ?? String(fallback));
    if (!Number.isFinite(parsed) || parsed < 0) {
      return fallback;
    }
    return parsed;
  }

  private computeAgeSeconds(value: Date | null | undefined, nowMs: number): number {
    if (!value) {
      return 0;
    }

    const ageMs = Math.max(nowMs - value.getTime(), 0);
    return Math.floor(ageMs / 1000);
  }

  private toReplaySnapshot(row: IntegrationOutbox): OutboxReplayAuditRowSnapshot {
    return {
      id: row.id,
      eventType: row.event_type,
      kafkaTopic: row.kafka_topic ?? null,
      publishAttempts: row.publish_attempts ?? 0,
      lastPublishError: row.last_publish_error ?? null,
      deadLetteredAt: row.dead_lettered_at?.toISOString() ?? null,
    };
  }

  private toDeadLetterListItem(row: IntegrationOutbox): OutboxDeadLetterListItem {
    return {
      id: row.id,
      aggregateType: row.aggregate_type,
      aggregateId: row.aggregate_id,
      eventType: row.event_type,
      occurredAt: row.occurred_at.toISOString(),
      publishAttempts: row.publish_attempts ?? 0,
      lastPublishError: row.last_publish_error ?? null,
      nextRetryAt: row.next_retry_at?.toISOString() ?? null,
      deadLetteredAt: row.dead_lettered_at?.toISOString() ?? null,
      correlationId: row.correlation_id ?? null,
      causationId: row.causation_id ?? null,
      partitionKey: row.partition_key ?? null,
      kafkaTopic: row.kafka_topic ?? null,
    };
  }
}
