import { Injectable, Logger } from '@nestjs/common';
import { trace } from '@opentelemetry/api';
import { DataSource } from 'typeorm';
import { RedisService } from '@/common/services/redis.service';
import { withDistributedLock } from '@/common/utils/redis-distributed-lock';
import { IntegrationOutbox } from '@/entities/integration-outbox.entity';
import { OutboxIntegrationSyncService } from './outbox-integration-sync.service';
import { OUTBOX_RELAY_SUPPORTED_EVENT_TYPES } from './outbox-relay-supported-event-types';

const OUTBOX_RELAY_LOCK_KEY = 'outbox:relay:lock';
const OUTBOX_RELAY_LOCK_TTL_SECONDS = 45;
const MAX_ROWS_PER_FLUSH = 50;

/**
 * Drains unpublished integration_outbox rows: sync projection + notifications in-process,
 * then sets published_at only after that pipeline succeeds (per row transaction).
 */
@Injectable()
export class OutboxRelayService {
  private readonly logger = new Logger(OutboxRelayService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly redisService: RedisService,
    private readonly integrationSync: OutboxIntegrationSyncService,
  ) {}

  /**
   * Single relay pass — Bull processor; Redis lock ensures at most one effective drain at a time.
   * Each eligible row is processed in its own DB transaction so partial progress commits (A published, B still pending).
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
            for (let i = 0; i < MAX_ROWS_PER_FLUSH; i++) {
              try {
                const step = await this.dataSource.transaction(async (em) => {
                  const rows = await em
                    .createQueryBuilder(IntegrationOutbox, 'o')
                    .setLock('pessimistic_write')
                    .setOnLocked('skip_locked')
                    .where('o.published_at IS NULL')
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
                  try {
                    await this.integrationSync.dispatchRow(em, row);
                  } catch (err) {
                    this.logger.error(
                      `Outbox sync failed id=${row.id} event_type=${row.event_type}: ${(err as Error).message}`,
                      (err as Error).stack,
                    );
                    throw err;
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
                this.logger.error(
                  `Outbox relay iteration aborted: ${(err as Error).message}`,
                  (err as Error).stack,
                );
                break;
              }
            }
            return published;
          } finally {
            span.end();
          }
        });
      },
      this.logger,
    );
    return { published };
  }
}
