import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, MoreThan, Repository } from 'typeorm';
import { IntegrationOutbox } from '@/entities/integration-outbox.entity';

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

@Injectable()
export class OutboxAdminService {
  constructor(
    @InjectRepository(IntegrationOutbox)
    private readonly outboxRepository: Repository<IntegrationOutbox>,
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

  async requeueDeadLetterRow(id: string): Promise<{ id: string; requeued: boolean }> {
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

    return { id, requeued: (result.affected ?? 0) > 0 };
  }

  async requeueAllDeadLetterRows(limit = 100): Promise<{ requested: number; requeued: number }> {
    const rows = await this.outboxRepository.find({
      where: {
        published_at: IsNull(),
        dead_lettered_at: MoreThan(new Date('1970-01-01T00:00:00.000Z')),
      },
      select: ['id'],
      order: { dead_lettered_at: 'DESC' },
      take: Math.max(1, Math.min(limit, 500)),
    });

    if (rows.length === 0) {
      return { requested: 0, requeued: 0 };
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

    return {
      requested: ids.length,
      requeued: result.affected ?? 0,
    };
  }

  async getRelayHealth(): Promise<{
    unpublishedBacklog: number;
    deadLetterRows: number;
    retryScheduledRows: number;
    oldestUnpublishedAt: string | null;
  }> {
    const [unpublishedBacklog, deadLetterRows, retryScheduledRows, oldestUnpublished] =
      await Promise.all([
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
      ]);

    return {
      unpublishedBacklog,
      deadLetterRows,
      retryScheduledRows,
      oldestUnpublishedAt: oldestUnpublished?.occurred_at?.toISOString() ?? null,
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
