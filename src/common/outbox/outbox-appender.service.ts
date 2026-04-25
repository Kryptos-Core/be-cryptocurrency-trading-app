import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { newUuid } from '@/common/utils/uuid.util';
import { IntegrationOutbox } from '@/entities/integration-outbox.entity';

export interface AppendIntegrationOutboxInput {
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Record<string, unknown>;
  /** When set, duplicate command retries map to the same unique row. */
  dedupeKey?: string;
}

/**
 * Writes integration outbox rows using the active transaction's EntityManager.
 */
@Injectable()
export class OutboxAppender {
  async append(manager: EntityManager, input: AppendIntegrationOutboxInput): Promise<void> {
    const row = manager.create(IntegrationOutbox, {
      id: newUuid(),
      aggregate_type: input.aggregateType,
      aggregate_id: input.aggregateId,
      event_type: input.eventType,
      payload: input.payload,
      published_at: null,
      dedupe_key: input.dedupeKey ?? null,
    });
    await manager.save(IntegrationOutbox, row);
  }
}
