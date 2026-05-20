import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { trace } from '@opentelemetry/api';
import { DataSource, IsNull, MoreThan, QueryFailedError } from 'typeorm';
import { RedisService } from '@/common/services/redis.service';
import { withDistributedLock } from '@/common/utils/redis-distributed-lock';
import { IntegrationOutbox } from '@/entities/integration-outbox.entity';
import { MetricsService } from '@/telemetry/metrics.service';
import { OUTBOX_DLQ_PUBLISHER, OUTBOX_EVENT_PUBLISHER } from './outbox.constants';
import type { OutboxEventPublisher } from './outbox-event-publisher.port';
import { OutboxDlqPublisher } from './kafka-outbox-dlq-publisher.service';
import { OutboxIntegrationSyncService } from './outbox-integration-sync.service';
import { OUTBOX_RELAY_SUPPORTED_EVENT_TYPES } from './outbox-relay-supported-event-types';

const OUTBOX_RELAY_LOCK_KEY = 'outbox:relay:lock';
const OUTBOX_RELAY_LOCK_TTL_SECONDS = 45;
const MAX_ROWS_PER_FLUSH = 50;
const DEAD_LETTER_RETRY_PER_FLUSH = 3;

class OutboxRelayRowFailure extends Error {
  constructor(
    readonly row: IntegrationOutbox,
    readonly causeError: Error,
  ) {
    super(causeError.message);
    this.name = 'OutboxRelayRowFailure';
  }
}

@Injectable()
export class OutboxRelayService {
  private readonly logger = new Logger(OutboxRelayService.name);
  private readonly maxAttempts: number;
  private readonly retryBaseMs: number;

  constructor(
    private readonly dataSource: DataSource,
    private readonly redisService: RedisService,
    private readonly integrationSync: OutboxIntegrationSyncService,
    private readonly configService: ConfigService,
    @Inject(OUTBOX_EVENT_PUBLISHER)
    private readonly outboxPublisher: OutboxEventPublisher,
    private readonly metricsService: MetricsService,
    @Inject(OUTBOX_DLQ_PUBLISHER)
    private readonly dlqPublisher: OutboxDlqPublisher,
  ) {
    this.maxAttempts = Math.max(
      1,
      Number(this.configService.get<string>('EVENT_OUTBOX_MAX_ATTEMPTS') ?? '5'),
    );
    this.retryBaseMs = Math.max(
      100,
      Number(this.configService.get<string>('EVENT_OUTBOX_RETRY_BASE_MS') ?? '1000'),
    );
  }

  async flushOnce(): Promise<{ published: number }> {
    const tracer = trace.getTracer('be-cryptocurrency-trading-app');
    const startMs = Date.now();
    let published = 0;
    await withDistributedLock(
      this.redisService,
      {
        lockKey: OUTBOX_RELAY_LOCK_KEY,
        ttlSeconds: OUTBOX_RELAY_LOCK_TTL_SECONDS,
        callerName: 'OutboxRelay',
      },
      async () => {
        published = await tracer.startActiveSpan('OutboxRelay.flushOnce', async (span) => {
          try {
            span.setAttribute('outbox.lock_ttl_seconds', OUTBOX_RELAY_LOCK_TTL_SECONDS);
            span.setAttribute('outbox.max_rows_per_flush', MAX_ROWS_PER_FLUSH);

            for (let i = 0; i < MAX_ROWS_PER_FLUSH; i++) {
              try {
                const step = await this.dataSource.transaction(async (em) => {
                  const now = new Date();
                  const rows = await em
                    .createQueryBuilder(IntegrationOutbox, 'o')
                    .setLock('pessimistic_write')
                    .setOnLocked('skip_locked')
                    .where('o.published_at IS NULL')
                    .andWhere('o.dead_lettered_at IS NULL')
                    .andWhere('(o.next_retry_at IS NULL OR o.next_retry_at <= :now)', { now })
                    .andWhere('o.event_type IN (:...types)', {
                      types: [...OUTBOX_RELAY_SUPPORTED_EVENT_TYPES],
                    })
                    .orderBy('o.occurred_at', 'ASC')
                    .take(1)
                    .getMany();

                  if (rows.length === 0) {
                    return 0;
                  }

                  const row = rows[0];
                  row.publish_attempts = (row.publish_attempts ?? 0) + 1;
                  row.last_publish_error = null;

                  try {
                    await this.integrationSync.dispatchRow(em, row);
                    const publishResult = await this.outboxPublisher.publish({
                      id: row.id,
                      eventType: row.event_type,
                      aggregateType: row.aggregate_type,
                      aggregateId: row.aggregate_id,
                      payload: row.payload,
                      schemaVersion: row.schema_version ?? 1,
                      correlationId: row.correlation_id,
                      causationId: row.causation_id,
                      partitionKey: row.partition_key,
                      kafkaTopic: row.kafka_topic,
                    });

                    row.kafka_partition =
                      publishResult?.kafkaPartition ?? row.kafka_partition ?? null;
                    row.kafka_offset = publishResult?.kafkaOffset ?? row.kafka_offset ?? null;
                    row.kafka_published_at =
                      publishResult?.publishedAt ?? row.kafka_published_at ?? new Date();
                    row.next_retry_at = null;
                    row.dead_lettered_at = null;
                    this.metricsService.incrementOutboxRelayPublished(row.event_type);
                  } catch (err) {
                    throw new OutboxRelayRowFailure(row, err as Error);
                  }

                  row.published_at = new Date();
                  await em.save(IntegrationOutbox, row);
                  return 1;
                });

                if (step === 0) {
                  break;
                }
                published += step;
              } catch (err) {
                if (err instanceof OutboxRelayRowFailure) {
                  const error = err.causeError;
                  const deadLettered = this.applyFailureMetadata(err.row, error);
                  await this.persistFailureState(err.row);

                  if (deadLettered) {
                    await this.publishToDlq(err.row, error);
                  }

                  this.logger.error(
                    `Outbox sync/publish failed id=${err.row.id} event_type=${err.row.event_type}: ${error.message}`,
                    error.stack,
                  );
                  break;
                }

                this.logger.error(
                  `Outbox relay iteration aborted: ${(err as Error).message}`,
                  (err as Error).stack,
                );
                break;
              }
            }

            span.setAttribute('outbox.rows_published', published);
            return published;
          } finally {
            span.end();
          }
        });
      },
      this.logger,
    );
    await this.updateOperationalMetrics();

    let deadLetterRetried = 0;
    if (published > 0) {
      for (let i = 0; i < DEAD_LETTER_RETRY_PER_FLUSH; i++) {
        const candidate = await this.findOldestDeadLetterRow();
        if (!candidate) break;
        const reset = await this.resetDeadLetterRow(candidate.id);
        if (reset) {
          this.logger.log(
            `Outbox dead-letter row reset and queued for retry: id=${candidate.id} event_type=${candidate.event_type}`,
          );
          deadLetterRetried++;
        }
      }
    }

    if (deadLetterRetried > 0) {
      await this.updateOperationalMetrics();
    }

    const durationMs = Date.now() - startMs;
    this.metricsService.recordOutboxFlushDuration(durationMs);

    return { published };
  }

  /**
   * Apply failure metadata to a row after a publish/sync failure.
   * @returns true if the row was moved to dead-letter state
   */
  private applyFailureMetadata(row: IntegrationOutbox, error: Error): boolean {
    row.last_publish_error = error.message;
    this.metricsService.incrementOutboxRelayFailure(row.event_type);

    if (row.publish_attempts >= this.maxAttempts) {
      row.dead_lettered_at = new Date();
      row.next_retry_at = null;
      this.metricsService.incrementOutboxRelayDeadLettered(row.event_type);
      return true;
    }

    row.dead_lettered_at = null;
    row.next_retry_at = new Date(Date.now() + this.computeRetryDelayMs(row.publish_attempts));
    this.metricsService.incrementOutboxRelayRetryScheduled(row.event_type);
    return false;
  }

  /**
   * Publish a dead-lettered row to the Kafka DLQ topic.
   * Errors are logged but never re-thrown — DLQ publish failure must not
   * block the normal relay loop.
   */
  private async publishToDlq(row: IntegrationOutbox, error: Error): Promise<void> {
    try {
      await this.dlqPublisher.publishDlq(row, error);
    } catch (dlqError) {
      this.logger.error(
        `DLQ publish failed for row=${row.id} event_type=${row.event_type}: ${(dlqError as Error).message}`,
      );
    }
  }

  private async persistFailureState(row: IntegrationOutbox): Promise<void> {
    try {
      await this.dataSource.transaction(async (em) => {
        await em.save(IntegrationOutbox, row);
        return 0;
      });
    } catch (error) {
      if (error instanceof QueryFailedError) {
        this.logger.error(
          `Failed to persist outbox failure state id=${row.id} event_type=${row.event_type}: ${error.message}`,
          error.stack,
        );
      }
      throw error;
    }
  }

  /**
   * Find the oldest dead-lettered row that is eligible for retry.
   * Only returns rows where event_type is still supported.
   */
  private async findOldestDeadLetterRow(): Promise<IntegrationOutbox | null> {
    return this.dataSource.manager.findOne(IntegrationOutbox, {
      where: {
        published_at: IsNull(),
        dead_lettered_at: MoreThan(new Date('1970-01-01T00:00:00.000Z')),
      },
      order: { dead_lettered_at: 'ASC' },
    });
  }

  /**
   * Reset a dead-lettered row so it re-enters the normal relay pipeline.
   * Resets attempt counter and clears dead-letter metadata.
   */
  private async resetDeadLetterRow(rowId: string): Promise<boolean> {
    try {
      const result = await this.dataSource
        .createQueryBuilder()
        .update(IntegrationOutbox)
        .set({
          dead_lettered_at: null,
          next_retry_at: null,
          last_publish_error: null,
          publish_attempts: 0,
        })
        .where('id = :id', { id: rowId })
        .andWhere('published_at IS NULL')
        .andWhere('dead_lettered_at IS NOT NULL')
        .execute();
      return (result.affected ?? 0) > 0;
    } catch (error) {
      this.logger.warn(
        `Failed to reset dead-letter row ${rowId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }

  private async updateOperationalMetrics(): Promise<void> {
    const repository = this.dataSource.getRepository(IntegrationOutbox);
    const [
      unpublishedRows,
      deadLetterRows,
      retryScheduledRows,
      oldestUnpublishedRow,
      oldestDeadLetterRow,
    ] = await Promise.all([
      repository.count({ where: { published_at: IsNull() } }),
      repository
        .createQueryBuilder('o')
        .where('o.published_at IS NULL')
        .andWhere('o.dead_lettered_at IS NOT NULL')
        .getCount(),
      repository
        .createQueryBuilder('o')
        .where('o.published_at IS NULL')
        .andWhere('o.dead_lettered_at IS NULL')
        .andWhere('o.next_retry_at IS NOT NULL')
        .getCount(),
      repository.findOne({
        where: { published_at: IsNull() },
        order: { occurred_at: 'ASC' },
      }),
      repository.findOne({
        where: {
          published_at: IsNull(),
          dead_lettered_at: MoreThan(new Date('1970-01-01T00:00:00.000Z')),
        },
        order: { dead_lettered_at: 'ASC' },
      }),
    ]);

    const nowMs = Date.now();
    const oldestUnpublishedAgeSeconds = oldestUnpublishedRow?.occurred_at
      ? Math.floor(Math.max(nowMs - oldestUnpublishedRow.occurred_at.getTime(), 0) / 1000)
      : 0;
    const oldestDeadLetterAgeSeconds = oldestDeadLetterRow?.dead_lettered_at
      ? Math.floor(Math.max(nowMs - oldestDeadLetterRow.dead_lettered_at.getTime(), 0) / 1000)
      : 0;

    this.metricsService.setOutboxBacklog('all', unpublishedRows);
    this.metricsService.setOutboxDeadLetterRows(deadLetterRows);
    this.metricsService.setOutboxRetryScheduledRows(retryScheduledRows);
    this.metricsService.setOutboxOldestUnpublishedAgeSeconds(oldestUnpublishedAgeSeconds);
    this.metricsService.setOutboxOldestDeadLetterAgeSeconds(oldestDeadLetterAgeSeconds);
  }

  private computeRetryDelayMs(attempt: number): number {
    return this.retryBaseMs * attempt;
  }
}
