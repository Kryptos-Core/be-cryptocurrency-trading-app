import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MetricsService } from '@/telemetry/metrics.service';
import { RedisService } from '@/common/services/redis.service';
import { OutboxAdminService } from './outbox-admin.service';
import { OutboxRelayAlertingCollectorService } from './outbox-relay-alerting-collector.service';

describe('OutboxRelayAlertingCollectorService', () => {
  it('publishes warning state-change when relay becomes degraded', async () => {
    const outboxAdminService = {
      getRelayHealth: jest.fn().mockResolvedValue({
        unpublishedBacklog: 10,
        deadLetterRows: 1,
        retryScheduledRows: 2,
        oldestUnpublishedAgeSeconds: 301,
        oldestDeadLetterAgeSeconds: 61,
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
          oldestUnpublishedAgeExceeded: true,
          oldestDeadLetterAgeExceeded: true,
          deadLetterRowsCritical: false,
          oldestUnpublishedAgeCritical: false,
          oldestDeadLetterAgeCritical: false,
          severity: 'warning',
          degraded: true,
        },
      }),
    };

    const redisService = {
      publish: jest.fn().mockResolvedValue(1),
    };

    const metricsService = {
      setOutboxRelayAlertSeverity: jest.fn(),
    };

    const configService = {
      get: jest.fn((key: string) => {
        if (key === 'EVENT_OUTBOX_ALERT_AUTOMATION_ENABLED') return 'true';
        if (key === 'EVENT_PUBLISHER_DRIVER') return 'kafka';
        if (key === 'EVENT_OUTBOX_ALERTS_CHANNEL') return 'outbox:alerts';
        return undefined;
      }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        OutboxRelayAlertingCollectorService,
        { provide: OutboxAdminService, useValue: outboxAdminService },
        { provide: RedisService, useValue: redisService },
        { provide: MetricsService, useValue: metricsService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    const service = moduleRef.get(OutboxRelayAlertingCollectorService);
    await service.collect();

    expect(metricsService.setOutboxRelayAlertSeverity).toHaveBeenCalledWith(1);
    expect(redisService.publish).toHaveBeenCalledWith(
      'outbox:alerts',
      expect.stringContaining('"currentSeverity":"warning"'),
    );
  });

  it('publishes recovery event when severity returns to none', async () => {
    const outboxAdminService = {
      getRelayHealth: jest
        .fn()
        .mockResolvedValueOnce({
          unpublishedBacklog: 5,
          deadLetterRows: 2,
          retryScheduledRows: 1,
          oldestUnpublishedAgeSeconds: 500,
          oldestDeadLetterAgeSeconds: 120,
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
            oldestUnpublishedAgeExceeded: true,
            oldestDeadLetterAgeExceeded: true,
            deadLetterRowsCritical: false,
            oldestUnpublishedAgeCritical: false,
            oldestDeadLetterAgeCritical: false,
            severity: 'warning',
            degraded: true,
          },
        })
        .mockResolvedValueOnce({
          unpublishedBacklog: 0,
          deadLetterRows: 0,
          retryScheduledRows: 0,
          oldestUnpublishedAgeSeconds: 0,
          oldestDeadLetterAgeSeconds: 0,
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
            deadLetterRowsExceeded: false,
            oldestUnpublishedAgeExceeded: false,
            oldestDeadLetterAgeExceeded: false,
            deadLetterRowsCritical: false,
            oldestUnpublishedAgeCritical: false,
            oldestDeadLetterAgeCritical: false,
            severity: 'none',
            degraded: false,
          },
        }),
    };

    const redisService = {
      publish: jest.fn().mockResolvedValue(1),
    };

    const metricsService = {
      setOutboxRelayAlertSeverity: jest.fn(),
    };

    const configService = {
      get: jest.fn((key: string) => {
        if (key === 'EVENT_OUTBOX_ALERT_AUTOMATION_ENABLED') return 'true';
        if (key === 'EVENT_PUBLISHER_DRIVER') return 'kafka';
        if (key === 'EVENT_OUTBOX_ALERTS_CHANNEL') return 'outbox:alerts';
        return undefined;
      }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        OutboxRelayAlertingCollectorService,
        { provide: OutboxAdminService, useValue: outboxAdminService },
        { provide: RedisService, useValue: redisService },
        { provide: MetricsService, useValue: metricsService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    const service = moduleRef.get(OutboxRelayAlertingCollectorService);
    await service.collect();
    await service.collect();

    expect(redisService.publish).toHaveBeenNthCalledWith(
      2,
      'outbox:alerts',
      expect.stringContaining('"currentSeverity":"none"'),
    );
    expect(metricsService.setOutboxRelayAlertSeverity).toHaveBeenLastCalledWith(0);
  });

  it('does nothing when automation is disabled', async () => {
    const outboxAdminService = {
      getRelayHealth: jest.fn(),
    };

    const redisService = {
      publish: jest.fn(),
    };

    const metricsService = {
      setOutboxRelayAlertSeverity: jest.fn(),
    };

    const configService = {
      get: jest.fn((key: string) => {
        if (key === 'EVENT_OUTBOX_ALERT_AUTOMATION_ENABLED') return 'false';
        return undefined;
      }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        OutboxRelayAlertingCollectorService,
        { provide: OutboxAdminService, useValue: outboxAdminService },
        { provide: RedisService, useValue: redisService },
        { provide: MetricsService, useValue: metricsService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    const service = moduleRef.get(OutboxRelayAlertingCollectorService);
    await service.collect();

    expect(outboxAdminService.getRelayHealth).not.toHaveBeenCalled();
    expect(redisService.publish).not.toHaveBeenCalled();
    expect(metricsService.setOutboxRelayAlertSeverity).not.toHaveBeenCalled();
  });
});
