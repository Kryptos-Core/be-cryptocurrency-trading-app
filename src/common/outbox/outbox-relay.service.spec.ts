import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { OutboxIntegrationEventType } from '@/common/integration-events/integration-event-catalog';
import { RedisService } from '@/common/services/redis.service';
import { IntegrationOutbox } from '@/entities/integration-outbox.entity';
import { MetricsService } from '@/telemetry/metrics.service';
import { OUTBOX_DLQ_PUBLISHER, OUTBOX_EVENT_PUBLISHER } from './outbox.constants';
import { OutboxIntegrationSyncService } from './outbox-integration-sync.service';
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
  row.published_at = null as never;
  row.occurred_at = new Date();
  row.dedupe_key = null as never;
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
  row.next_retry_at = null;
  row.dead_lettered_at = null;
  row.dlq_retry_count = 0;
  return row;
}

describe('OutboxRelayService', () => {
  let integrationSync: { dispatchRow: jest.Mock };
  let outboxPublisher: { publish: jest.Mock };
  let savedRows: IntegrationOutbox[];
  let queryCall: number;
  let persistFailureStateInSameTransaction: boolean;
  let metricsService: {
    incrementOutboxRelayPublished: jest.Mock;
    incrementOutboxRelayFailure: jest.Mock;
    incrementOutboxRelayRetryScheduled: jest.Mock;
    incrementOutboxRelayDeadLettered: jest.Mock;
    incrementOutboxRelayDlqRetrySkipped: jest.Mock;
    setOutboxBacklog: jest.Mock;
    setOutboxDeadLetterRows: jest.Mock;
    setOutboxRetryScheduledRows: jest.Mock;
    setOutboxOldestUnpublishedAgeSeconds: jest.Mock;
    setOutboxOldestDeadLetterAgeSeconds: jest.Mock;
    recordOutboxFlushDuration: jest.Mock;
  };
  let dlqPublisher: { isEnabled: () => boolean; publishDlq: jest.Mock };

  const buildDataSource = (rowsSequence: IntegrationOutbox[][]) => {
    queryCall = 0;
    savedRows = [];
    const backlogRepository = {
      count: jest.fn().mockResolvedValue(0),
      findOne: jest.fn().mockResolvedValue(null),
      createQueryBuilder: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(0),
      })),
    };

    return {
      getRepository: jest.fn(() => backlogRepository),
      manager: { findOne: jest.fn().mockResolvedValue(null) },
      transaction: jest.fn(async (fn: (em: unknown) => Promise<number>) => {
        const seq = rowsSequence[queryCall] ?? [];
        const txIndex = queryCall;
        queryCall++;
        const em = {
          createQueryBuilder: () => ({
            setLock: () => ({
              setOnLocked: () => ({
                where: () => ({
                  andWhere: () => ({
                    andWhere: () => ({
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
            }),
          }),
          save: jest.fn(async (_entity: unknown, row: IntegrationOutbox) => {
            if (persistFailureStateInSameTransaction && txIndex === 0 && row.last_publish_error) {
              throw new Error(
                'current transaction is aborted, commands ignored until end of transaction block',
              );
            }
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
    persistFailureStateInSameTransaction = false;
    integrationSync = { dispatchRow: jest.fn().mockResolvedValue(undefined) };
    outboxPublisher = {
      publish: jest.fn().mockResolvedValue({
        kafkaPartition: 2,
        kafkaOffset: '42',
        publishedAt: new Date('2026-04-25T00:00:00.000Z'),
      }),
    };
    metricsService = {
      incrementOutboxRelayPublished: jest.fn(),
      incrementOutboxRelayFailure: jest.fn(),
      incrementOutboxRelayRetryScheduled: jest.fn(),
      incrementOutboxRelayDeadLettered: jest.fn(),
      incrementOutboxRelayDlqRetrySkipped: jest.fn(),
      setOutboxBacklog: jest.fn(),
      setOutboxDeadLetterRows: jest.fn(),
      setOutboxRetryScheduledRows: jest.fn(),
      setOutboxOldestUnpublishedAgeSeconds: jest.fn(),
      setOutboxOldestDeadLetterAgeSeconds: jest.fn(),
      recordOutboxFlushDuration: jest.fn(),
    };
    dlqPublisher = {
      isEnabled: () => true,
      publishDlq: jest.fn().mockResolvedValue(undefined),
    };
  });

  const configService = {
    get: jest.fn((key: string) => {
      switch (key) {
        case 'EVENT_OUTBOX_MAX_ATTEMPTS':
          return '3';
        case 'EVENT_OUTBOX_RETRY_BASE_MS':
          return '1000';
        default:
          return undefined;
      }
    }),
  };

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
        { provide: ConfigService, useValue: configService },
        { provide: OUTBOX_EVENT_PUBLISHER, useValue: outboxPublisher },
        { provide: MetricsService, useValue: metricsService },
        { provide: OUTBOX_DLQ_PUBLISHER, useValue: dlqPublisher },
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
    expect(savedRows[0].next_retry_at).toBeNull();
    expect(savedRows[0].dead_lettered_at).toBeNull();
    expect(savedRows[0].published_at).not.toBeNull();
    expect(metricsService.incrementOutboxRelayPublished).toHaveBeenCalledWith(rowA.event_type);
    expect(metricsService.setOutboxBacklog).toHaveBeenCalledWith('all', expect.any(Number));
    expect(metricsService.setOutboxOldestUnpublishedAgeSeconds).toHaveBeenCalledWith(
      expect.any(Number),
    );
    expect(metricsService.setOutboxOldestDeadLetterAgeSeconds).toHaveBeenCalledWith(
      expect.any(Number),
    );
  });

  it('persists retry schedule in a separate transaction when the main transaction is aborted', async () => {
    const rowA = makeRow(
      'abababab-abab-7aba-8aba-abababababab',
      OutboxIntegrationEventType.MarketPairUpdatedV1,
    );
    const ds = buildDataSource([[rowA], []]);
    persistFailureStateInSameTransaction = true;
    outboxPublisher.publish.mockRejectedValueOnce(new Error('publisher boom'));

    const moduleRef = await Test.createTestingModule({
      providers: [
        OutboxRelayService,
        { provide: DataSource, useValue: ds },
        { provide: RedisService, useValue: {} },
        { provide: OutboxIntegrationSyncService, useValue: integrationSync },
        { provide: ConfigService, useValue: configService },
        { provide: OUTBOX_EVENT_PUBLISHER, useValue: outboxPublisher },
        { provide: MetricsService, useValue: metricsService },
        { provide: OUTBOX_DLQ_PUBLISHER, useValue: dlqPublisher },
      ],
    }).compile();

    const relay = moduleRef.get(OutboxRelayService);
    const { published } = await relay.flushOnce();

    expect(published).toBe(0);
    expect(savedRows).toHaveLength(1);
    expect(savedRows[0].publish_attempts).toBe(1);
    expect(savedRows[0].last_publish_error).toBe('publisher boom');
    expect(savedRows[0].next_retry_at).toBeInstanceOf(Date);
    expect(savedRows[0].dead_lettered_at).toBeNull();
    expect(savedRows[0].published_at).toBeNull();
    expect(ds.transaction).toHaveBeenCalledTimes(2);
    expect(metricsService.incrementOutboxRelayFailure).toHaveBeenCalledWith(rowA.event_type);
    expect(metricsService.incrementOutboxRelayRetryScheduled).toHaveBeenCalledWith(rowA.event_type);
  });

  it('stores retry schedule when publisher fails before max attempts', async () => {
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
        { provide: ConfigService, useValue: configService },
        { provide: OUTBOX_EVENT_PUBLISHER, useValue: outboxPublisher },
        { provide: MetricsService, useValue: metricsService },
        { provide: OUTBOX_DLQ_PUBLISHER, useValue: dlqPublisher },
      ],
    }).compile();

    const relay = moduleRef.get(OutboxRelayService);
    const { published } = await relay.flushOnce();

    expect(published).toBe(0);
    expect(savedRows).toHaveLength(1);
    expect(savedRows[0].publish_attempts).toBe(1);
    expect(savedRows[0].last_publish_error).toBe('publisher boom');
    expect(savedRows[0].next_retry_at).toBeInstanceOf(Date);
    expect(savedRows[0].dead_lettered_at).toBeNull();
    expect(savedRows[0].published_at).toBeNull();
    expect(metricsService.incrementOutboxRelayFailure).toHaveBeenCalledWith(rowA.event_type);
    expect(metricsService.incrementOutboxRelayRetryScheduled).toHaveBeenCalledWith(rowA.event_type);
  });

  it('dead-letters row when max attempts is reached', async () => {
    const rowA = makeRow(
      'cccccccc-cccc-7ccc-8ccc-cccccccccccc',
      OutboxIntegrationEventType.MarketPairUpdatedV1,
    );
    rowA.publish_attempts = 2;
    const ds = buildDataSource([[rowA]]);
    outboxPublisher.publish.mockRejectedValueOnce(new Error('still broken'));

    const moduleRef = await Test.createTestingModule({
      providers: [
        OutboxRelayService,
        { provide: DataSource, useValue: ds },
        { provide: RedisService, useValue: {} },
        { provide: OutboxIntegrationSyncService, useValue: integrationSync },
        { provide: ConfigService, useValue: configService },
        { provide: OUTBOX_EVENT_PUBLISHER, useValue: outboxPublisher },
        { provide: MetricsService, useValue: metricsService },
        { provide: OUTBOX_DLQ_PUBLISHER, useValue: dlqPublisher },
      ],
    }).compile();

    const relay = moduleRef.get(OutboxRelayService);
    const { published } = await relay.flushOnce();

    expect(published).toBe(0);
    expect(savedRows).toHaveLength(1);
    expect(savedRows[0].publish_attempts).toBe(3);
    expect(savedRows[0].dead_lettered_at).toBeInstanceOf(Date);
    expect(savedRows[0].next_retry_at).toBeNull();
    expect(savedRows[0].published_at).toBeNull();
    expect(metricsService.incrementOutboxRelayDeadLettered).toHaveBeenCalledWith(rowA.event_type);
  });

  it('stops when no more eligible rows', async () => {
    const ds = buildDataSource([[]]);
    const moduleRef = await Test.createTestingModule({
      providers: [
        OutboxRelayService,
        { provide: DataSource, useValue: ds },
        { provide: RedisService, useValue: {} },
        { provide: OutboxIntegrationSyncService, useValue: integrationSync },
        { provide: ConfigService, useValue: configService },
        { provide: OUTBOX_EVENT_PUBLISHER, useValue: outboxPublisher },
        { provide: MetricsService, useValue: metricsService },
        { provide: OUTBOX_DLQ_PUBLISHER, useValue: dlqPublisher },
      ],
    }).compile();

    const relay = moduleRef.get(OutboxRelayService);
    const { published } = await relay.flushOnce();
    expect(published).toBe(0);
    expect(integrationSync.dispatchRow).not.toHaveBeenCalled();
    expect(outboxPublisher.publish).not.toHaveBeenCalled();
  });

  it('skips dead-letter reset once dlq_retry_count reaches EVENT_OUTBOX_DLQ_MAX_RETRIES', async () => {
    const dlqRow = makeRow(
      'dddddddd-dddd-7ddd-8ddd-dddddddddddd',
      OutboxIntegrationEventType.MarketPairUpdatedV1,
    );
    dlqRow.publish_attempts = 5;
    dlqRow.dead_lettered_at = new Date('2026-04-20T00:00:00.000Z');
    dlqRow.dlq_retry_count = 3; // already at the cap

    const publishableRow = makeRow(
      'eeeeeeee-eeee-7eee-8eee-eeeeeeeeeeee',
      OutboxIntegrationEventType.MarketPairCreatedV1,
    );

    const updateBuilder = {
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 0 }),
    };
    const cqbMock = jest.fn(() => updateBuilder);

    const backlogRepository = {
      count: jest.fn().mockResolvedValue(0),
      findOne: jest.fn().mockResolvedValue(null),
      createQueryBuilder: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(0),
      })),
    };

    const transactionCalls: unknown[][] = [];
    const ds = {
      getRepository: jest.fn(() => backlogRepository),
      manager: { findOne: jest.fn().mockResolvedValue(dlqRow) },
      transaction: jest.fn(async (fn: (em: unknown) => Promise<number>) => {
        const txIndex = transactionCalls.length;
        transactionCalls.push([]);
        const em = {
          createQueryBuilder: () => ({
            setLock: () => ({
              setOnLocked: () => ({
                where: () => ({
                  andWhere: () => ({
                    andWhere: () => ({
                      andWhere: () => ({
                        orderBy: () => ({
                          take: () => ({
                            getMany: async () => (txIndex === 0 ? [publishableRow] : []),
                          }),
                        }),
                      }),
                    }),
                  }),
                }),
              }),
            }),
          }),
          save: jest.fn(async (_entity: unknown, row: IntegrationOutbox) => {
            /* row is published */
          }),
        };
        return fn(em);
      }),
      createQueryBuilder: cqbMock,
    } as unknown as DataSource;
    void transactionCalls;

    const configServiceLocal = {
      get: jest.fn((key: string) => {
        switch (key) {
          case 'EVENT_OUTBOX_MAX_ATTEMPTS':
            return '5';
          case 'EVENT_OUTBOX_RETRY_BASE_MS':
            return '1000';
          case 'EVENT_OUTBOX_DLQ_MAX_RETRIES':
            return '3';
          case 'EVENT_OUTBOX_DEAD_LETTER_RETRY_PER_FLUSH':
            return '3';
          default:
            return undefined;
        }
      }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        OutboxRelayService,
        { provide: DataSource, useValue: ds },
        { provide: RedisService, useValue: {} },
        { provide: OutboxIntegrationSyncService, useValue: integrationSync },
        { provide: ConfigService, useValue: configServiceLocal },
        { provide: OUTBOX_EVENT_PUBLISHER, useValue: outboxPublisher },
        { provide: MetricsService, useValue: metricsService },
        { provide: OUTBOX_DLQ_PUBLISHER, useValue: dlqPublisher },
      ],
    }).compile();

    const relay = moduleRef.get(OutboxRelayService);
    const { published } = await relay.flushOnce();

    expect(published).toBe(1);
    // Once published > 0 the relay walks the DLQ candidate loop.
    // With dlq_retry_count already at the cap, the skip path should fire
    // and a metrics event should be emitted with the row's event_type label.
    expect(metricsService.incrementOutboxRelayDlqRetrySkipped).toHaveBeenCalledWith(
      dlqRow.event_type,
    );
    expect(cqbMock).not.toHaveBeenCalled(); // atomic reset UPDATE was not even issued
  });

  it('resets dead-letter row when dlq_retry_count is below the cap and increments the counter', async () => {
    const dlqRow = makeRow(
      'ffffffff-ffff-7fff-8fff-ffffffffffff',
      OutboxIntegrationEventType.MarketPairUpdatedV1,
    );
    dlqRow.publish_attempts = 5;
    dlqRow.dead_lettered_at = new Date('2026-04-20T00:00:00.000Z');
    dlqRow.dlq_retry_count = 1; // below cap

    const publishableRow = makeRow(
      'aaaa1111-aaaa-7aaa-8aaa-aaaaaaaaaaaa',
      OutboxIntegrationEventType.MarketPairCreatedV1,
    );

    // The repository backlog builder (used by updateOperationalMetrics) is
    // independent from the reset UPDATE builder, so we mock both pathways.
    const updateBuilder = {
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const cqbMock = jest.fn(() => updateBuilder);

    const backlogRepository = {
      count: jest.fn().mockResolvedValue(0),
      findOne: jest.fn().mockResolvedValue(null),
      createQueryBuilder: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(0),
      })),
    };

    const transactionCalls: unknown[][] = [];
    const ds = {
      getRepository: jest.fn(() => backlogRepository),
      manager: { findOne: jest.fn().mockResolvedValue(dlqRow) },
      transaction: jest.fn(async (fn: (em: unknown) => Promise<number>) => {
        const txIndex = transactionCalls.length;
        transactionCalls.push([]);
        const em = {
          createQueryBuilder: () => ({
            setLock: () => ({
              setOnLocked: () => ({
                where: () => ({
                  andWhere: () => ({
                    andWhere: () => ({
                      andWhere: () => ({
                        orderBy: () => ({
                          take: () => ({
                            getMany: async () => (txIndex === 0 ? [publishableRow] : []),
                          }),
                        }),
                      }),
                    }),
                  }),
                }),
              }),
            }),
          }),
          save: jest.fn(async (_entity: unknown, row: IntegrationOutbox) => {
            /* row is published */
          }),
        };
        return fn(em);
      }),
      createQueryBuilder: cqbMock,
    } as unknown as DataSource;
    void transactionCalls;

    const configServiceLocal = {
      get: jest.fn((key: string) => {
        switch (key) {
          case 'EVENT_OUTBOX_MAX_ATTEMPTS':
            return '5';
          case 'EVENT_OUTBOX_RETRY_BASE_MS':
            return '1000';
          case 'EVENT_OUTBOX_DLQ_MAX_RETRIES':
            return '3';
          case 'EVENT_OUTBOX_DEAD_LETTER_RETRY_PER_FLUSH':
            return '3';
          default:
            return undefined;
        }
      }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        OutboxRelayService,
        { provide: DataSource, useValue: ds },
        { provide: RedisService, useValue: {} },
        { provide: OutboxIntegrationSyncService, useValue: integrationSync },
        { provide: ConfigService, useValue: configServiceLocal },
        { provide: OUTBOX_EVENT_PUBLISHER, useValue: outboxPublisher },
        { provide: MetricsService, useValue: metricsService },
        { provide: OUTBOX_DLQ_PUBLISHER, useValue: dlqPublisher },
      ],
    }).compile();

    const relay = moduleRef.get(OutboxRelayService);
    const { published } = await relay.flushOnce();

    expect(published).toBe(1);
    // Once published > 0 the relay walks the DLQ candidate loop and calls
    // resetDeadLetterRow once per iteration. With dlq_retry_count below the
    // cap, the reset query must be issued via `ds.createQueryBuilder()`.
    expect(cqbMock).toHaveBeenCalled();
    expect(metricsService.incrementOutboxRelayDlqRetrySkipped).not.toHaveBeenCalled();
  });
});
