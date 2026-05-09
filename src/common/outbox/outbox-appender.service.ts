import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import {
  buildCanonicalIntegrationEventEnvelope,
  type CanonicalIntegrationEventEnvelope,
} from '@/common/integration-events/canonical-integration-event-envelope';
import { IntegrationOutbox } from '@/entities/integration-outbox.entity';
import { assertMaxAggregateIdLength } from '@/common/utils/aggregate-id.util';

export interface AppendIntegrationOutboxInput {
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Record<string, unknown>;
  /** When set, duplicate command retries map to the same unique row. */
  dedupeKey?: string;
  schemaVersion?: number;
  correlationId?: string;
  causationId?: string;
  partitionKey?: string;
  kafkaTopic?: string;
  occurredAt?: Date;
}

/**
 * Writes integration outbox rows using the active transaction's EntityManager.
 */
@Injectable()
export class OutboxAppender {
  private static readonly MAX_DEDUPE_KEY_LENGTH = 191;
  private static readonly MAX_VARCHAR_191_LENGTH = 191;

  async append(manager: EntityManager, input: AppendIntegrationOutboxInput): Promise<void> {
    // Validate column constraints to fail fast with descriptive errors instead of DB-level truncation
    assertMaxAggregateIdLength(input.aggregateId, `${input.aggregateType}::${input.eventType}`);

    if (input.dedupeKey !== undefined && input.dedupeKey !== null && input.dedupeKey.length > OutboxAppender.MAX_DEDUPE_KEY_LENGTH) {
      throw new Error(
        `dedupe_key exceeds ${OutboxAppender.MAX_DEDUPE_KEY_LENGTH} chars (got ${input.dedupeKey.length}): "${input.dedupeKey.slice(0, 80)}${input.dedupeKey.length > 80 ? '...' : ''}"`,
      );
    }

    for (const [field, value] of [
      ['correlation_id', input.correlationId],
      ['causation_id', input.causationId],
      ['partition_key', input.partitionKey],
      ['kafka_topic', input.kafkaTopic],
    ] as const) {
      if (value !== undefined && value !== null && value.length > OutboxAppender.MAX_VARCHAR_191_LENGTH) {
        throw new Error(`${field} exceeds ${OutboxAppender.MAX_VARCHAR_191_LENGTH} chars (got ${value.length})`);
      }
    }

    const envelope = buildCanonicalIntegrationEventEnvelope({
      eventType: input.eventType,
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      payload: input.payload,
      schemaVersion: input.schemaVersion,
      correlationId: input.correlationId,
      causationId: input.causationId,
      idempotencyKey: input.dedupeKey,
      partitionKey: input.partitionKey,
      occurredAt: input.occurredAt,
    });

    const row = manager.create(IntegrationOutbox, {
      id: envelope.eventId,
      aggregate_type: input.aggregateType,
      aggregate_id: input.aggregateId,
      event_type: input.eventType,
      payload: envelope as unknown as Record<string, unknown>,
      occurred_at: new Date(envelope.occurredAt),
      published_at: null,
      dedupe_key: input.dedupeKey ?? null,
      schema_version: envelope.schemaVersion,
      correlation_id: envelope.correlationId ?? null,
      causation_id: envelope.causationId ?? null,
      partition_key: envelope.partitionKey ?? null,
      kafka_topic: input.kafkaTopic ?? null,
      kafka_partition: null,
      kafka_offset: null,
      kafka_published_at: null,
      publish_attempts: 0,
      last_publish_error: null,
    });
    await manager.save(IntegrationOutbox, row);
  }

  buildEnvelope<TPayload extends object>(
    input: Omit<AppendIntegrationOutboxInput, 'payload'> & { payload: TPayload },
  ): CanonicalIntegrationEventEnvelope<TPayload> {
    return buildCanonicalIntegrationEventEnvelope<TPayload>({
      eventType: input.eventType,
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      payload: input.payload,
      schemaVersion: input.schemaVersion,
      correlationId: input.correlationId,
      causationId: input.causationId,
      idempotencyKey: input.dedupeKey,
      partitionKey: input.partitionKey,
      occurredAt: input.occurredAt,
    });
  }
}
