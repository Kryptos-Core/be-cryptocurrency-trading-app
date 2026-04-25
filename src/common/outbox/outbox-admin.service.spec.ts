import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { IntegrationOutbox } from '@/entities/integration-outbox.entity';
import { OutboxAdminService } from './outbox-admin.service';

describe('OutboxAdminService', () => {
  let service: OutboxAdminService;
  let repository: {
    find: jest.Mock;
    findOne: jest.Mock;
    count: jest.Mock;
    createQueryBuilder: jest.Mock;
  };

  beforeEach(async () => {
    const execute = jest.fn();
    const qb = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute,
      getCount: jest.fn(),
    };

    repository = {
      find: jest.fn(),
      findOne: jest.fn(),
      count: jest.fn(),
      createQueryBuilder: jest.fn(() => qb),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        OutboxAdminService,
        {
          provide: getRepositoryToken(IntegrationOutbox),
          useValue: repository,
        },
      ],
    }).compile();

    service = moduleRef.get(OutboxAdminService);
  });

  it('lists dead-letter rows as FE-safe operational DTOs', async () => {
    repository.find.mockResolvedValueOnce([
      {
        id: 'outbox-1',
        aggregate_type: 'trade',
        aggregate_id: 'trade-1',
        event_type: 'trade.executed',
        occurred_at: new Date('2026-04-25T10:00:00.000Z'),
        publish_attempts: 5,
        last_publish_error: 'boom',
        next_retry_at: null,
        dead_lettered_at: new Date('2026-04-25T10:05:00.000Z'),
        correlation_id: 'corr-1',
        causation_id: 'cause-1',
        partition_key: 'BTC-USDT',
        kafka_topic: 'trades.executed',
      },
    ]);

    const items = await service.listDeadLetterRows(20);

    expect(items).toEqual([
      {
        id: 'outbox-1',
        aggregateType: 'trade',
        aggregateId: 'trade-1',
        eventType: 'trade.executed',
        occurredAt: '2026-04-25T10:00:00.000Z',
        publishAttempts: 5,
        lastPublishError: 'boom',
        nextRetryAt: null,
        deadLetteredAt: '2026-04-25T10:05:00.000Z',
        correlationId: 'corr-1',
        causationId: 'cause-1',
        partitionKey: 'BTC-USDT',
        kafkaTopic: 'trades.executed',
      },
    ]);
  });

  it('requeues one dead-letter row', async () => {
    const qb = repository.createQueryBuilder();
    qb.execute.mockResolvedValueOnce({ affected: 1 });

    const result = await service.requeueDeadLetterRow('outbox-2');

    expect(result).toEqual({ id: 'outbox-2', requeued: true });
  });

  it('requeues a bounded batch of dead-letter rows', async () => {
    repository.find.mockResolvedValueOnce([{ id: 'a' }, { id: 'b' }]);
    const qb = repository.createQueryBuilder();
    qb.execute.mockResolvedValueOnce({ affected: 2 });

    const result = await service.requeueAllDeadLetterRows(2);

    expect(result).toEqual({ requested: 2, requeued: 2 });
  });

  it('returns relay health summary', async () => {
    repository.count.mockResolvedValueOnce(11).mockResolvedValueOnce(2);
    repository.createQueryBuilder().getCount.mockResolvedValueOnce(3);
    repository.findOne.mockResolvedValueOnce({
      occurred_at: new Date('2026-04-25T09:00:00.000Z'),
    });

    const health = await service.getRelayHealth();

    expect(health).toEqual({
      unpublishedBacklog: 11,
      deadLetterRows: 2,
      retryScheduledRows: 3,
      oldestUnpublishedAt: '2026-04-25T09:00:00.000Z',
    });
  });
});
