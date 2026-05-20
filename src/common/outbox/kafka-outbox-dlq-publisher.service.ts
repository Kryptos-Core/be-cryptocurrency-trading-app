import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { Kafka, Partitioners, type Producer } from 'kafkajs';
import { IntegrationOutbox } from '@/entities/integration-outbox.entity';
import { MetricsService } from '@/telemetry/metrics.service';

/**
 * Interface for DLQ publisher. Allows a noop implementation when Kafka DLQ is disabled.
 */
export interface OutboxDlqPublisher {
  isEnabled(): boolean;
  publishDlq(row: IntegrationOutbox, error: Error): Promise<void>;
}

/**
 * KafkaOutboxDlqPublisher
 *
 * Publishes dead-lettered outbox rows to a dedicated Kafka DLQ topic.
 * Topic naming: {KAFKA_TOPIC_PREFIX}.dlq.{event_type}
 * e.g., "trading.dlq.market.ticker.updated"
 *
 * Each DLQ message includes:
 * - Full original event payload
 * - DLQ metadata (dead_lettered_at, last_error, publish_attempts)
 * - Headers for routing and filtering
 *
 * Phase 6: Kafka DLQ topic for dead-lettered events
 */
@Injectable()
export class KafkaOutboxDlqPublisher implements OutboxDlqPublisher {
  private readonly logger = new Logger(KafkaOutboxDlqPublisher.name);
  private readonly tracer = trace.getTracer('be-cryptocurrency-trading-app');
  private producerPromise: Promise<Producer> | null = null;
  private readonly enabled: boolean;

  constructor(
    private readonly configService: ConfigService,
    private readonly metricsService: MetricsService,
  ) {
    this.enabled =
      String(this.configService.get<string>('KAFKA_DLQ_TOPIC_ENABLED') ?? 'true')
        .trim()
        .toLowerCase() !== 'false';
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  async publishDlq(row: IntegrationOutbox, error: Error): Promise<void> {
    if (!this.enabled) {
      return;
    }

    return this.tracer.startActiveSpan('KafkaOutboxDlqPublisher.publishDlq', async (span) => {
      const topic = this.resolveDlqTopic(row.event_type);
      const deadLetteredAt = new Date();

      span.setAttribute('kafka.topic', topic);
      span.setAttribute('outbox.row_id', row.id);
      span.setAttribute('outbox.event_type', row.event_type);
      span.setAttribute('outbox.aggregate_type', row.aggregate_type);
      span.setAttribute('dlq.publish_attempts', row.publish_attempts);
      span.setAttribute('dlq.last_error', error.message);

      try {
        const producer = await this.getProducer();
        await producer.send({
          topic,
          messages: [
            {
              key: row.id,
              value: JSON.stringify({
                originalEventId: row.id,
                eventType: row.event_type,
                aggregateType: row.aggregate_type,
                aggregateId: row.aggregate_id,
                payload: row.payload,
                schemaVersion: row.schema_version ?? 1,
                occurredAt: row.occurred_at?.toISOString(),
                correlationId: row.correlation_id ?? undefined,
                causationId: row.causation_id ?? undefined,
                partitionKey: row.partition_key ?? undefined,
                originalTopic: row.kafka_topic ?? undefined,
                publishAttempts: row.publish_attempts,
                lastError: error.message,
                deadLetteredAt: deadLetteredAt.toISOString(),
              }),
              headers: {
                original_event_id: row.id,
                original_event_type: row.event_type,
                error_reason: error.message.substring(0, 256),
                dead_lettered_at: deadLetteredAt.toISOString(),
                publish_attempts: String(row.publish_attempts),
                original_topic: row.kafka_topic ?? '',
              },
            },
          ],
        });

        this.metricsService.incrementOutboxDlqPublished(row.event_type);
        span.setStatus({ code: SpanStatusCode.OK });

        this.logger.warn(
          `Published outbox row to DLQ topic=${topic} id=${row.id} event_type=${row.event_type} attempts=${row.publish_attempts}`,
        );
      } catch (dlqError) {
        this.metricsService.incrementOutboxDlqPublishFailure(row.event_type);
        span.setAttribute('error', true);
        span.setAttribute('error.message', (dlqError as Error).message);
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: (dlqError as Error).message,
        });

        this.logger.error(
          `Failed to publish outbox row to DLQ topic=${topic} id=${row.id}: ${(dlqError as Error).message}`,
        );
      } finally {
        span.end();
      }
    });
  }

  private resolveDlqTopic(eventType: string): string {
    const prefix = (this.configService.get<string>('KAFKA_TOPIC_PREFIX') ?? '').trim();
    const eventTopic = eventType.toLowerCase().replace(/[^a-z0-9]+/g, '.');
    return prefix ? `${prefix}.dlq.${eventTopic}` : `dlq.${eventTopic}`;
  }

  private async getProducer(): Promise<Producer> {
    if (!this.producerPromise) {
      this.producerPromise = this.connectProducer();
    }
    return this.producerPromise;
  }

  private async connectProducer(): Promise<Producer> {
    const brokers = (this.configService.get<string>('KAFKA_BROKERS') ?? '')
      .split(',')
      .map((b) => b.trim())
      .filter(Boolean);

    if (brokers.length === 0) {
      throw new Error('KAFKA_BROKERS is required when KAFKA_DLQ_TOPIC_ENABLED=true');
    }

    const clientId =
      this.configService.get<string>('KAFKA_CLIENT_ID') ?? 'crypto-trading-backend-outbox-dlq';

    const kafka = new Kafka({
      clientId,
      brokers,
      requestTimeout: 30_000,
      connectionTimeout: 10_000,
    });

    const producer = kafka.producer({
      createPartitioner: Partitioners.DefaultPartitioner,
    });
    await producer.connect();
    this.logger.log(
      `Kafka DLQ publisher connected brokers=${brokers.join(',')} topic_prefix=${this.configService.get('KAFKA_TOPIC_PREFIX') ?? '(none)'}`,
    );
    return producer;
  }
}

/**
 * NoopOutboxDlqPublisher
 *
 * DLQ publisher that does nothing — used when KAFKA_DLQ_TOPIC_ENABLED=false
 * or when EVENT_PUBLISHER_DRIVER=noop.
 */
@Injectable()
export class NoopOutboxDlqPublisher implements OutboxDlqPublisher {
  private readonly logger = new Logger(NoopOutboxDlqPublisher.name);

  isEnabled(): boolean {
    return false;
  }

  async publishDlq(_row: IntegrationOutbox, _error: Error): Promise<void> {
    this.logger.debug('DLQ publishing disabled, skipping');
  }
}
