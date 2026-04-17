import { Injectable, Logger } from '@nestjs/common';
import { EventBus } from '@nestjs/cqrs';
import { trace } from '@opentelemetry/api';
import { DataSource } from 'typeorm';
import {
  MarketPairReadModelSyncEvent,
  type MarketPairReadModelSyncPayload,
} from '@/common/integration-events/market-pair-read-model-sync.integration-event';
import { RedisService } from '@/common/services/redis.service';
import { withDistributedLock } from '@/common/utils/redis-distributed-lock';
import { IntegrationOutbox } from '@/entities/integration-outbox.entity';

const OUTBOX_RELAY_LOCK_KEY = 'outbox:relay:lock';
const OUTBOX_RELAY_LOCK_TTL_SECONDS = 45;

/**
 * Drains unpublished integration_outbox rows and publishes them to the Nest CQRS EventBus.
 */
@Injectable()
export class OutboxRelayService {
  private readonly logger = new Logger(OutboxRelayService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly eventBus: EventBus,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Single relay pass — intended to be invoked from a Bull processor (possibly on multiple workers;
   * Redis lock ensures at most one effective drain at a time).
   */
  async flushOnce(): Promise<{ published: number }> {
    const tracer = trace.getTracer('be-cryptocurrency-trading-app');
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
            return await this.dataSource.transaction(async (em) => {
              const pending = await em
                .createQueryBuilder(IntegrationOutbox, 'o')
                .setLock('pessimistic_write')
                .where('o.published_at IS NULL')
                .orderBy('o.occurred_at', 'ASC')
                .take(50)
                .getMany();

              let count = 0;
              for (const row of pending) {
                const evt = this.toIntegrationEvent(row);
                if (evt) {
                  this.eventBus.publish(evt);
                } else {
                  this.logger.warn(
                    `Unknown outbox event_type=${row.event_type} id=${row.id} — skipping publish`,
                  );
                }
                row.published_at = new Date();
                await em.save(IntegrationOutbox, row);
                count++;
              }
              return count;
            });
          } finally {
            span.end();
          }
        });
      },
      this.logger,
    );
    return { published };
  }

  private toIntegrationEvent(row: IntegrationOutbox): unknown | undefined {
    switch (row.event_type) {
      case 'MarketPair.Created@v1':
      case 'MarketPair.Updated@v1':
        return new MarketPairReadModelSyncEvent(
          row.id,
          row.payload as unknown as MarketPairReadModelSyncPayload,
        );
      default:
        return undefined;
    }
  }
}
