import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { OutboxIntegrationEventType } from '@/common/integration-events/integration-event-catalog';
import { RedisService } from '@/common/services/redis.service';
import { IntegrationOutbox } from '@/entities/integration-outbox.entity';
import { OutboxIntegrationSyncService } from './outbox-integration-sync.service';
import { OUTBOX_EVENT_PUBLISHER } from './outbox.constants';
import { OutboxRelayService } from './outbox-relay.service';

jest.mock('@/common/utils/redis-distributed-lock', () => ({
  withDistributedLock: async (_redis: unknown, _opts: unknown, fn: () => Promise<unknown>) => fn(),
}));

function makeRow(id: string, eventType: string): IntegrationOutbox {
  const row = new IntegrationOutbox();
  row.id = id;
  row.aggregate_type = 'Test';
  row.aggregate_id = 'agg';
  row.event_type = eventType;
  row.payload = {
    pairId: 'p1',
    symbol: 'btcusdt',
    baseCurrencyId: 'b',
    quoteCurrencyId: 'q',
    isActive: true,
  };
  row.published_at = null as any;
  row.occurred_at = new Date();
  row.dedupe_key = null as any;
  row.schema_version = 1;
  row.correlation_id = 'corr-1';
  row.causation_id = null;
  row.partition_key = 'BTC-USDT';
  row.kafka_topic = 'market.events';
  row.kafka_partition = null;
  row.kafka_offset = null;
  row.kafka_published_at = null;
  row.publish_attempts = 0;
  row.last_publish_error = null;
  return row;
}

describe('OutboxRelayService', () => {
  let integrationSync: { dispatchRow: jest.Mock };
  let outboxPublisher: { publish: jest.Mock };
  let savedRows: IntegrationOutbox[];
  let queryCall: number;

  const buildDataSource = (rowsSequence: IntegrationOutbox[][]) => {
    queryCall = 0;
    savedRows = [];
    return {
      transaction: jest.fn(async (fn: (em: unknown) => Promise<number>) => {
        const seq = rowsSequence[queryCall] ?? [];
        queryCall++;
        const em = {
          createQueryBuilder: () => ({
            setLock: () => ({
              setOnLocked: () => ({
                where: () => ({
                  andWhere: () => ({
                    orderBy: () => ({
                      take: () => ({
                        getMany: async () => seq,
                      }),
                    }),
                  }),
                }),
              }),
            }),
          }),
          save: jest.fn(async (_entity: unknown, row: IntegrationOutbox) => {
            savedRows.push({ ...row });
            if (row.published_at) {
              row.published_at = new Date();
            }
          }),
        };
        return fn(em);
      }),
    } as unknown as DataSource;
  };

  beforeEach(() => {
    integrationSync = { dispatchRow: jest.fn().mockResolvedValue(undefined) };
    outboxPublisher = {
      publish: jest.fn().mockResolvedValue({
        kafkaPartition: 2,
        kafkaOffset: '42',
        publishedAt: new Date('2026-04-25T00:00:00.000Z'),
      }),
    };
  });

  it('marks published_at only after sync and publish succeed', async () => {
    const rowA = makeRow(
      'aaaaaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa',
      OutboxIntegrationEventType.MarketPairCreatedV1,
    );
    const ds = buildDataSource([[rowA], []]);

    const moduleRef = await Test.createTestingModule({
      providers: [
        OutboxRelayService,
        { provide: DataSource, useValue: ds },
        { provide: RedisService, useValue: {} },
        { provide: OutboxIntegrationSyncService, useValue: integrationSync },
        { provide: OUTBOX_EVENT_PUBLISHER, useValue: outboxPublisher },
      ],
    }).compile();

    const relay = moduleRef.get(OutboxRelayService);
    const { published } = await relay.flushOnce();

    expect(published).toBe(1);
    expect(integrationSync.dispatchRow).toHaveBeenCalledTimes(1);
    expect(outboxPublisher.publish).toHaveBeenCalledTimes(1);
    expect(savedRows).toHaveLength(1);
    expect(savedRows[0].id).toBe(rowA.id);
    expect(savedRows[0].publish_attempts).toBe(1);
    expect(savedRows[0].kafka_partition).toBe(2);
    expect(savedRows[0].kafka_offset).toBe('42');
    expect(savedRows[0].kafka_published_at).toEqual(new Date('2026-04-25T00:00:00.000Z'));
    expect(savedRows[0].last_publish_error).toBeNull();
    expect(savedRows[0].published_at).not.toBeNull();
  });

  it('stores publish attempt/error and stops when publisher fails', async () => {
    const rowA = makeRow(
      'bbbbbbbb-bbbb-7bbb-8bbb-bbbbbbbbbbbb',
      OutboxIntegrationEventType.MarketPairUpdatedV1,
    );
    const ds = buildDataSource([[rowA]]);
    outboxPublisher.publish.mockRejectedValueOnce(new Error('publisher boom'));

    const moduleRef = await Test.createTestingModule({
      providers: [
        OutboxRelayService,
        { provide: DataSource, useValue: ds },
        { provide: RedisService, useValue: {} },
        { provide: OutboxIntegrationSyncService, useValue: integrationSync },
        { provide: OUTBOX_EVENT_PUBLISHER, useValue: outboxPublisher },
      ],
    }).compile();

    const relay = moduleRef.get(OutboxRelayService);
    const { published } = await relay.flushOnce();

    expect(published).toBe(0);
    expect(integrationSync.dispatchRow).toHaveBeenCalledTimes(1);
    expect(outboxPublisher.publish).toHaveBeenCalledTimes(1);
    expect(savedRows).toHaveLength(1);
    expect(savedRows[0].publish_attempts).toBe(1);
    expect(savedRows[0].last_publish_error).toBe('publisher boom');
    expect(savedRows[0].published_at).toBeNull();
  });

  it('stops when no more eligible rows', async () => {
    const ds = buildDataSource([[]]);
    const moduleRef = await Test.createTestingModule({
      providers: [
        OutboxRelayService,
        { provide: DataSource, useValue: ds },
        { provide: RedisService, useValue: {} },
        { provide: OutboxIntegrationSyncService, useValue: integrationSync },
        { provide: OUTBOX_EVENT_PUBLISHER, useValue: outboxPublisher },
      ],
    }).compile();

    const relay = moduleRef.get(OutboxRelayService);
    const { published } = await relay.flushOnce();
    expect(published).toBe(0);
    expect(integrationSync.dispatchRow).not.toHaveBeenCalled();
    expect(outboxPublisher.publish).not.toHaveBeenCalled();
  });
});
