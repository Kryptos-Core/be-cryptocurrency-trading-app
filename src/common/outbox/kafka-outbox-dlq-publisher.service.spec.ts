import { ConfigService } from '@nestjs/config';
import { IntegrationOutbox } from '@/entities/integration-outbox.entity';
import { MetricsService } from '@/telemetry/metrics.service';
import {
  KafkaOutboxDlqPublisher,
  NoopOutboxDlqPublisher,
} from './kafka-outbox-dlq-publisher.service';

function makeRow(): IntegrationOutbox {
  const row = new IntegrationOutbox();
  row.id = 'test-id';
  row.aggregate_type = 'trade';
  row.aggregate_id = 'agg-1';
  row.event_type = 'trade.executed';
  row.payload = { symbol: 'BTCUSDT' };
  row.occurred_at = new Date('2026-05-01T00:00:00.000Z');
  row.published_at = null;
  row.dedupe_key = null;
  row.schema_version = 1;
  row.correlation_id = 'corr-1';
  row.causation_id = null;
  row.partition_key = 'BTC-USDT';
  row.kafka_topic = 'trading.trade.executed';
  row.kafka_partition = null;
  row.kafka_offset = null;
  row.kafka_published_at = null;
  row.publish_attempts = 5;
  row.last_publish_error = 'kafka connection timeout';
  row.next_retry_at = null;
  row.dead_lettered_at = new Date('2026-05-01T00:05:00.000Z');
  return row;
}

describe('KafkaOutboxDlqPublisher', () => {
  describe('isEnabled', () => {
    it('returns true when KAFKA_DLQ_TOPIC_ENABLED is not false', () => {
      const configService = {
        get: jest.fn((key: string) => {
          if (key === 'KAFKA_DLQ_TOPIC_ENABLED') return 'true';
          return undefined;
        }),
      } as unknown as ConfigService;

      const publisher = new KafkaOutboxDlqPublisher(
        configService,
        { incrementOutboxDlqPublished: jest.fn(), incrementOutboxDlqPublishFailure: jest.fn() } as unknown as MetricsService,
      );

      expect(publisher.isEnabled()).toBe(true);
    });

    it('returns true when KAFKA_DLQ_TOPIC_ENABLED is not set', () => {
      const configService = {
        get: jest.fn().mockReturnValue(undefined),
      } as unknown as ConfigService;

      const publisher = new KafkaOutboxDlqPublisher(
        configService,
        { incrementOutboxDlqPublished: jest.fn(), incrementOutboxDlqPublishFailure: jest.fn() } as unknown as MetricsService,
      );

      expect(publisher.isEnabled()).toBe(true);
    });

    it('returns false when KAFKA_DLQ_TOPIC_ENABLED is false', () => {
      const configService = {
        get: jest.fn((key: string) => {
          if (key === 'KAFKA_DLQ_TOPIC_ENABLED') return 'false';
          return undefined;
        }),
      } as unknown as ConfigService;

      const publisher = new KafkaOutboxDlqPublisher(
        configService,
        { incrementOutboxDlqPublished: jest.fn(), incrementOutboxDlqPublishFailure: jest.fn() } as unknown as MetricsService,
      );

      expect(publisher.isEnabled()).toBe(false);
    });

    it('returns false when KAFKA_DLQ_TOPIC_ENABLED is FALSE (uppercase)', () => {
      const configService = {
        get: jest.fn((key: string) => {
          if (key === 'KAFKA_DLQ_TOPIC_ENABLED') return 'FALSE';
          return undefined;
        }),
      } as unknown as ConfigService;

      const publisher = new KafkaOutboxDlqPublisher(
        configService,
        { incrementOutboxDlqPublished: jest.fn(), incrementOutboxDlqPublishFailure: jest.fn() } as unknown as MetricsService,
      );

      expect(publisher.isEnabled()).toBe(false);
    });
  });

  describe('publishDlq', () => {
    it('skips publishing when disabled', async () => {
      const configService = {
        get: jest.fn((key: string) => {
          if (key === 'KAFKA_DLQ_TOPIC_ENABLED') return 'false';
          return undefined;
        }),
      } as unknown as ConfigService;

      const metricsService = {
        incrementOutboxDlqPublished: jest.fn(),
        incrementOutboxDlqPublishFailure: jest.fn(),
      } as unknown as MetricsService;

      const publisher = new KafkaOutboxDlqPublisher(configService, metricsService);
      const row = makeRow();

      await publisher.publishDlq(row, new Error('boom'));

      expect(metricsService.incrementOutboxDlqPublished).not.toHaveBeenCalled();
    });
  });
});

describe('NoopOutboxDlqPublisher', () => {
  it('isEnabled returns false', () => {
    const publisher = new NoopOutboxDlqPublisher();
    expect(publisher.isEnabled()).toBe(false);
  });

  it('publishDlq does nothing', async () => {
    const publisher = new NoopOutboxDlqPublisher();
    const row = makeRow();
    await publisher.publishDlq(row, new Error('boom'));
  });
});
