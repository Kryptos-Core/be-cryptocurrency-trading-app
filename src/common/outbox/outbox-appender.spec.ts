import { Test } from '@nestjs/testing';
import type { EntityManager } from 'typeorm';
import { isCanonicalIntegrationEventEnvelope } from '@/common/integration-events/canonical-integration-event-envelope';
import { OutboxAppender } from './outbox-appender.service';

describe('OutboxAppender', () => {
  it('persists a row via EntityManager.save with canonical envelope payload', async () => {
    const saved: unknown[] = [];
    const manager = {
      create: (_cls: unknown, row: unknown) => row,
      save: async (_cls: unknown, row: unknown) => {
        saved.push(row);
      },
    } as unknown as EntityManager;

    const moduleRef = await Test.createTestingModule({
      providers: [OutboxAppender],
    }).compile();

    const appender = moduleRef.get(OutboxAppender);
    await appender.append(manager, {
      aggregateType: 'MarketPair',
      aggregateId: 'p1',
      eventType: 'MarketPair.Created@v1',
      payload: {
        pairId: 'p1',
        symbol: 'BTC/USDT',
        baseCurrencyId: 'b',
        quoteCurrencyId: 'q',
        isActive: true,
      },
      dedupeKey: 'k1',
      correlationId: 'corr-1',
      causationId: 'cause-1',
      partitionKey: 'BTC-USDT',
      kafkaTopic: 'market.events',
      schemaVersion: 3,
    });

    expect(saved).toHaveLength(1);

    const row = saved[0] as {
      id: string;
      aggregate_type: string;
      aggregate_id: string;
      event_type: string;
      dedupe_key: string | null;
      occurred_at: Date;
      payload: unknown;
      schema_version: number;
      correlation_id: string | null;
      causation_id: string | null;
      partition_key: string | null;
      kafka_topic: string | null;
      kafka_partition: number | null;
      kafka_offset: string | null;
      kafka_published_at: Date | null;
      publish_attempts: number;
      last_publish_error: string | null;
    };

    expect(row.event_type).toBe('MarketPair.Created@v1');
    expect(row.aggregate_type).toBe('MarketPair');
    expect(row.aggregate_id).toBe('p1');
    expect(row.dedupe_key).toBe('k1');
    expect(row.occurred_at).toBeInstanceOf(Date);
    expect(row.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(row.schema_version).toBe(3);
    expect(row.correlation_id).toBe('corr-1');
    expect(row.causation_id).toBe('cause-1');
    expect(row.partition_key).toBe('BTC-USDT');
    expect(row.kafka_topic).toBe('market.events');
    expect(row.kafka_partition).toBeNull();
    expect(row.kafka_offset).toBeNull();
    expect(row.kafka_published_at).toBeNull();
    expect(row.publish_attempts).toBe(0);
    expect(row.last_publish_error).toBeNull();

    expect(isCanonicalIntegrationEventEnvelope(row.payload)).toBe(true);

    const envelope = row.payload as {
      eventId: string;
      eventType: string;
      aggregateType: string;
      aggregateId: string;
      occurredAt: string;
      schemaVersion: number;
      correlationId?: string;
      causationId?: string;
      partitionKey?: string;
      payload: Record<string, unknown>;
    };

    expect(envelope.eventId).toBe(row.id);
    expect(envelope.eventType).toBe('MarketPair.Created@v1');
    expect(envelope.aggregateType).toBe('MarketPair');
    expect(envelope.aggregateId).toBe('p1');
    expect(envelope.schemaVersion).toBe(3);
    expect(envelope.correlationId).toBe('corr-1');
    expect(envelope.causationId).toBe('cause-1');
    expect(envelope.partitionKey).toBe('BTC-USDT');
    expect(envelope.payload).toEqual({
      pairId: 'p1',
      symbol: 'BTC/USDT',
      baseCurrencyId: 'b',
      quoteCurrencyId: 'q',
      isActive: true,
    });
  });

  it('buildEnvelope returns canonical metadata without persisting', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [OutboxAppender],
    }).compile();

    const appender = moduleRef.get(OutboxAppender);
    const envelope = appender.buildEnvelope({
      aggregateType: 'trade',
      aggregateId: 'trade-1',
      eventType: 'trades.executed',
      payload: { tradeId: 'trade-1', pairId: 'BTC-USDT' },
      schemaVersion: 2,
      correlationId: 'corr-2',
      causationId: 'order-1',
      dedupeKey: 'idem-1',
      partitionKey: 'BTC-USDT',
      occurredAt: new Date('2026-04-25T00:00:00.000Z'),
    });

    expect(envelope.schemaVersion).toBe(2);
    expect(envelope.eventType).toBe('trades.executed');
    expect(envelope.aggregateType).toBe('trade');
    expect(envelope.aggregateId).toBe('trade-1');
    expect(envelope.correlationId).toBe('corr-2');
    expect(envelope.causationId).toBe('order-1');
    expect(envelope.idempotencyKey).toBe('idem-1');
    expect(envelope.partitionKey).toBe('BTC-USDT');
    expect(envelope.occurredAt).toBe('2026-04-25T00:00:00.000Z');
  });
});
