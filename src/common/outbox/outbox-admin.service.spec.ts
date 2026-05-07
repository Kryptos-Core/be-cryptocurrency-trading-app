import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { IntegrationOutbox } from '@/entities/integration-outbox.entity';
import { SystemConfigService } from '@/modules/system-config/system-config.service';
import { OutboxAdminService } from './outbox-admin.service';
import { OutboxReplayAuditService } from './outbox-replay-audit.service';

describe('OutboxAdminService', () => {
  let service: OutboxAdminService;
  let repository: {
    find: jest.Mock;
    findOne: jest.Mock;
    count: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let systemConfigService: { get: jest.Mock };
  let outboxReplayAuditService: { record: jest.Mock; list: jest.Mock };

  beforeEach(async () => {
    const execute = jest.fn();
    const qb = {
      update: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
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

    systemConfigService = { get: jest.fn() };
    outboxReplayAuditService = { record: jest.fn(), list: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        OutboxAdminService,
        {
          provide: getRepositoryToken(IntegrationOutbox),
          useValue: repository,
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn() },
        },
        {
          provide: SystemConfigService,
          useValue: systemConfigService,
        },
        {
          provide: OutboxReplayAuditService,
          useValue: outboxReplayAuditService,
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

  it('requeues one dead-letter row and records replay audit', async () => {
    repository.findOne.mockResolvedValueOnce({
      id: 'outbox-2',
      event_type: 'trade.executed',
      kafka_topic: 'trades.executed',
      publish_attempts: 3,
      last_publish_error: 'boom',
      dead_lettered_at: new Date('2026-04-25T10:05:00.000Z'),
    });
    const qb = repository.createQueryBuilder();
    qb.execute.mockResolvedValueOnce({ affected: 1 });
    outboxReplayAuditService.record.mockResolvedValueOnce({
      auditId: 'audit-1',
      outputFile: 'reports/outbox-replay/2026-04-26.json',
    });

    const result = await service.requeueDeadLetterRow('outbox-2', {
      actorUserId: 'admin-1',
      actorRole: 'ADMIN',
      reason: 'manual retry after kafka recovery',
    });

    expect(result).toEqual({
      id: 'outbox-2',
      requeued: true,
      auditId: 'audit-1',
      auditOutputFile: 'reports/outbox-replay/2026-04-26.json',
    });

    expect(outboxReplayAuditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'requeue_one',
        actorUserId: 'admin-1',
        actorRole: 'ADMIN',
        reason: 'manual retry after kafka recovery',
        targetRowId: 'outbox-2',
        selectedRowCount: 1,
        requeuedRowCount: 1,
      }),
    );
  });

  it('requeues a bounded batch of dead-letter rows and records replay audit', async () => {
    repository.find.mockResolvedValueOnce([
      {
        id: 'a',
        event_type: 'trade.executed',
        kafka_topic: 'trades.executed',
        publish_attempts: 2,
        last_publish_error: 'x',
        dead_lettered_at: new Date('2026-04-25T10:00:00.000Z'),
      },
      {
        id: 'b',
        event_type: 'wallet.balance_changed',
        kafka_topic: 'wallet.balance',
        publish_attempts: 1,
        last_publish_error: 'y',
        dead_lettered_at: new Date('2026-04-25T10:01:00.000Z'),
      },
    ]);
    const qb = repository.createQueryBuilder();
    qb.execute.mockResolvedValueOnce({ affected: 2 });
    outboxReplayAuditService.record.mockResolvedValueOnce({
      auditId: 'audit-2',
      outputFile: 'reports/outbox-replay/2026-04-26.json',
    });

    const result = await service.requeueAllDeadLetterRows(2, {
      actorUserId: 'risk-1',
      actorRole: 'RISK_OFFICER',
      reason: 'replay after publisher hotfix',
    });

    expect(result).toEqual({
      requested: 2,
      requeued: 2,
      auditId: 'audit-2',
      auditOutputFile: 'reports/outbox-replay/2026-04-26.json',
    });

    expect(outboxReplayAuditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'requeue_bulk',
        actorUserId: 'risk-1',
        actorRole: 'RISK_OFFICER',
        reason: 'replay after publisher hotfix',
        requestedLimit: 2,
        selectedRowCount: 2,
        requeuedRowCount: 2,
      }),
    );
  });

  it('lists replay audits', async () => {
    outboxReplayAuditService.list.mockResolvedValueOnce([
      {
        auditId: 'audit-3',
        recordedAt: '2026-04-26T10:00:00.000Z',
      },
    ]);

    const items = await service.listReplayAudits(5);

    expect(items).toEqual([
      {
        auditId: 'audit-3',
        recordedAt: '2026-04-26T10:00:00.000Z',
      },
    ]);
    expect(outboxReplayAuditService.list).toHaveBeenCalledWith(5);
  });

  it('returns relay health summary with warning and critical thresholds', async () => {
    systemConfigService.get
      .mockResolvedValueOnce('0')
      .mockResolvedValueOnce('300')
      .mockResolvedValueOnce('60')
      .mockResolvedValueOnce('10')
      .mockResolvedValueOnce('1800')
      .mockResolvedValueOnce('600');

    repository.count.mockResolvedValueOnce(11).mockResolvedValueOnce(2);
    repository.createQueryBuilder().getCount.mockResolvedValueOnce(3);
    repository.findOne
      .mockResolvedValueOnce({
        occurred_at: new Date('2026-04-25T09:00:00.000Z'),
      })
      .mockResolvedValueOnce({
        dead_lettered_at: new Date('2026-04-25T09:30:00.000Z'),
      });

    const health = await service.getRelayHealth();

    expect(health).toEqual({
      unpublishedBacklog: 11,
      deadLetterRows: 2,
      retryScheduledRows: 3,
      oldestUnpublishedAt: '2026-04-25T09:00:00.000Z',
      oldestDeadLetterAt: '2026-04-25T09:30:00.000Z',
      oldestUnpublishedAgeSeconds: expect.any(Number),
      oldestDeadLetterAgeSeconds: expect.any(Number),
      thresholds: {
        warning: {
          maxDeadLetterRows: 0,
          maxOldestUnpublishedAgeSeconds: 300,
          maxOldestDeadLetterAgeSeconds: 60,
        },
        critical: {
          maxDeadLetterRows: 10,
          maxOldestUnpublishedAgeSeconds: 1800,
          maxOldestDeadLetterAgeSeconds: 600,
        },
      },
      alerts: {
        deadLetterRowsExceeded: true,
        oldestUnpublishedAgeExceeded: expect.any(Boolean),
        oldestDeadLetterAgeExceeded: expect.any(Boolean),
        deadLetterRowsCritical: false,
        oldestUnpublishedAgeCritical: expect.any(Boolean),
        oldestDeadLetterAgeCritical: expect.any(Boolean),
        severity: expect.stringMatching(/none|warning|critical/),
        degraded: true,
      },
    });
  });

  it('purges abandoned messages older than threshold with max attempts reached', async () => {
    const oldDate = new Date('2026-04-20T00:00:00.000Z');
    repository.find.mockResolvedValueOnce([
      {
        id: 'abandoned-1',
        event_type: 'trade.executed',
        kafka_topic: 'trades.executed',
        publish_attempts: 5,
        occurred_at: oldDate,
      },
      {
        id: 'abandoned-2',
        event_type: 'wallet.balance_changed',
        kafka_topic: 'wallet.balance',
        publish_attempts: 5,
        occurred_at: oldDate,
      },
    ]);
    const qb = repository.createQueryBuilder();
    qb.execute.mockResolvedValueOnce({ affected: 2 });
    outboxReplayAuditService.record.mockResolvedValueOnce({
      auditId: 'audit-purge-1',
      outputFile: 'reports/outbox-replay/2026-05-07.json',
    });

    const result = await service.purgeAbandonedMessages(86400, {
      actorUserId: 'admin-1',
      actorRole: 'ADMIN',
      reason: 'cleanup noop driver backlog',
    });

    expect(result).toEqual({
      deletedCount: 2,
      auditId: 'audit-purge-1',
      auditOutputFile: 'reports/outbox-replay/2026-05-07.json',
    });

    expect(outboxReplayAuditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'purge_abandoned',
        actorUserId: 'admin-1',
        actorRole: 'ADMIN',
        reason: 'cleanup noop driver backlog',
        selectedRowCount: 2,
        requeuedRowCount: 2,
      }),
    );
  });

  it('does not purge messages younger than threshold', async () => {
    const recentDate = new Date();
    repository.find.mockResolvedValueOnce([
      {
        id: 'recent-1',
        event_type: 'trade.executed',
        publish_attempts: 5,
        occurred_at: recentDate,
      },
    ]);
    outboxReplayAuditService.record.mockResolvedValueOnce({
      auditId: 'audit-no-purge',
      outputFile: 'reports/outbox-replay/2026-05-07.json',
    });

    const result = await service.purgeAbandonedMessages(86400, {
      actorUserId: 'admin-1',
      actorRole: 'ADMIN',
    });

    expect(result.deletedCount).toBe(0);
    expect(outboxReplayAuditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedRowCount: 0,
        requeuedRowCount: 0,
      }),
    );
  });

  it('does not purge messages with insufficient attempts even if old', async () => {
    const oldDate = new Date('2026-04-20T00:00:00.000Z');
    repository.find.mockResolvedValueOnce([
      {
        id: 'retry-1',
        event_type: 'trade.executed',
        publish_attempts: 2,
        occurred_at: oldDate,
      },
    ]);
    outboxReplayAuditService.record.mockResolvedValueOnce({
      auditId: 'audit-no-purge-attempts',
      outputFile: 'reports/outbox-replay/2026-05-07.json',
    });

    const result = await service.purgeAbandonedMessages(86400, {
      actorUserId: 'admin-1',
      actorRole: 'ADMIN',
    });

    expect(result.deletedCount).toBe(0);
  });
});
