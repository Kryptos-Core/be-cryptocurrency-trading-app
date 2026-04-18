import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { OutboxIntegrationEventType } from '@/common/integration-events/integration-event-catalog';
import { RedisService } from '@/common/services/redis.service';
import { IntegrationOutbox } from '@/entities/integration-outbox.entity';
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
  row.published_at = null as any;
  row.occurred_at = new Date();
  row.dedupe_key = null as any;
  return row;
}

describe('OutboxRelayService', () => {
  let integrationSync: { dispatchRow: jest.Mock };
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
            savedRows.push(row);
            row.published_at = new Date();
          }),
        };
        return fn(em);
      }),
    } as unknown as DataSource;
  };

  beforeEach(() => {
    integrationSync = { dispatchRow: jest.fn().mockResolvedValue(undefined) };
  });

  it('marks published_at only after dispatch succeeds (per-row commits)', async () => {
    const rowA = makeRow(
      'aaaaaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa',
      OutboxIntegrationEventType.MarketPairCreatedV1,
    );
    const rowB = makeRow(
      'bbbbbbbb-bbbb-7bbb-8bbb-bbbbbbbbbbbb',
      OutboxIntegrationEventType.MarketPairUpdatedV1,
    );
    const ds = buildDataSource([[rowA], [rowB], []]);

    const moduleRef = await Test.createTestingModule({
      providers: [
        OutboxRelayService,
        { provide: DataSource, useValue: ds },
        { provide: RedisService, useValue: {} },
        { provide: OutboxIntegrationSyncService, useValue: integrationSync },
      ],
    }).compile();

    const relay = moduleRef.get(OutboxRelayService);
    integrationSync.dispatchRow
      .mockImplementationOnce(async () => undefined)
      .mockImplementationOnce(async () => {
        throw new Error('boom');
      });

    const { published } = await relay.flushOnce();

    expect(published).toBe(1);
    expect(integrationSync.dispatchRow).toHaveBeenCalledTimes(2);
    expect(savedRows).toHaveLength(1);
    expect(savedRows[0].id).toBe(rowA.id);
    expect(savedRows[0].published_at).not.toBeNull();
  });

  it('stops when no more eligible rows', async () => {
    const ds = buildDataSource([[]]);
    const moduleRef = await Test.createTestingModule({
      providers: [
        OutboxRelayService,
        { provide: DataSource, useValue: ds },
        { provide: RedisService, useValue: {} },
        { provide: OutboxIntegrationSyncService, useValue: integrationSync },
      ],
    }).compile();

    const relay = moduleRef.get(OutboxRelayService);
    const { published } = await relay.flushOnce();
    expect(published).toBe(0);
    expect(integrationSync.dispatchRow).not.toHaveBeenCalled();
  });
});
