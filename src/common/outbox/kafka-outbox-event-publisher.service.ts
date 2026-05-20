import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { Kafka, Partitioners, type Producer } from 'kafkajs';
import { MetricsService } from '@/telemetry/metrics.service';
import type {
  OutboxEventPublisher,
  OutboxEventPublisherDriver,
  PublishOutboxRowInput,
  PublishOutboxRowResult,
} from './outbox-event-publisher.port';

@Injectable()
export class KafkaOutboxEventPublisher implements OutboxEventPublisher {
  private readonly logger = new Logger(KafkaOutboxEventPublisher.name);
  private readonly tracer = trace.getTracer('be-cryptocurrency-trading-app');
  private producerPromise: Promise<Producer> | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly metricsService: MetricsService,
  ) {}

  async publish(row: PublishOutboxRowInput): Promise<PublishOutboxRowResult> {
    const topic = this.resolveTopic(row);
    const startMs = Date.now();

    return this.tracer.startActiveSpan('KafkaOutboxEventPublisher.publish', async (span) => {
      span.setAttribute('kafka.topic', topic);
      span.setAttribute('kafka.event_type', row.eventType);
      span.setAttribute('kafka.partition_key', row.partitionKey ?? 'aggregate_id');
      span.setAttribute('outbox.row_id', row.id);
      span.setAttribute('outbox.aggregate_type', row.aggregateType);

      try {
        const producer = await this.getProducer();
        const result = await producer.send({
          topic,
          messages: [
            {
              key: row.partitionKey ?? row.aggregateId,
              value: JSON.stringify({
                eventId: row.id,
                eventType: row.eventType,
                aggregateType: row.aggregateType,
                aggregateId: row.aggregateId,
                schemaVersion: row.schemaVersion,
                correlationId: row.correlationId ?? undefined,
                causationId: row.causationId ?? undefined,
                partitionKey: row.partitionKey ?? undefined,
                payload: row.payload,
              }),
              headers: {
                event_id: row.id,
                event_type: row.eventType,
                aggregate_type: row.aggregateType,
                aggregate_id: row.aggregateId,
                schema_version: String(row.schemaVersion),
              },
            },
          ],
        });

        const metadata = result[0];
        const durationMs = Date.now() - startMs;
        span.setAttribute('kafka.partition', metadata.partition);
        span.setAttribute('kafka.offset', metadata.baseOffset ?? '');
        span.setAttribute('kafka.publish_duration_ms', durationMs);
        span.setStatus({ code: SpanStatusCode.OK });

        this.metricsService.recordKafkaPublishDuration(topic, row.eventType, durationMs);

        return {
          kafkaPartition: metadata.partition,
          kafkaOffset: metadata.baseOffset,
          publishedAt: new Date(),
        };
      } catch (error) {
        const durationMs = Date.now() - startMs;
        span.setAttribute('kafka.publish_duration_ms', durationMs);
        span.setAttribute('error', true);
        span.setAttribute('error.message', (error as Error).message);
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: (error as Error).message,
        });

        this.logger.error(
          `Kafka publish failed topic=${topic} row=${row.id} event_type=${row.eventType}: ${(error as Error).message}`,
          (error as Error).stack,
        );

        throw error;
      } finally {
        span.end();
      }
    });
  }

  private resolveTopic(row: PublishOutboxRowInput): string {
    const explicitTopic = row.kafkaTopic?.trim();
    if (explicitTopic) {
      return explicitTopic;
    }

    const prefix = (this.configService.get<string>('KAFKA_TOPIC_PREFIX') ?? '').trim();
    const fallback = row.eventType.toLowerCase().replace(/[^a-z0-9]+/g, '.');
    return prefix ? `${prefix}.${fallback}` : fallback;
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
      .map((broker) => broker.trim())
      .filter(Boolean);

    if (brokers.length === 0) {
      throw new Error('KAFKA_BROKERS is required when EVENT_PUBLISHER_DRIVER=kafka');
    }

    const clientId =
      this.configService.get<string>('KAFKA_CLIENT_ID') ?? 'crypto-trading-backend-outbox';

    const requestTimeout = Math.max(
      5000,
      Number(this.configService.get<string>('KAFKA_REQUEST_TIMEOUT_MS') ?? '30000'),
    );
    const connectionTimeout = Math.max(
      1000,
      Number(this.configService.get<string>('KAFKA_CONNECTION_TIMEOUT_MS') ?? '10000'),
    );

    const kafka = new Kafka({
      clientId,
      brokers,
      requestTimeout,
      connectionTimeout,
    });

    const producer = kafka.producer({
      createPartitioner: Partitioners.DefaultPartitioner,
    });
    await producer.connect();
    this.logger.log(
      `Kafka outbox publisher connected brokers=${brokers.join(',')} ` +
        `requestTimeout=${requestTimeout}ms connectionTimeout=${connectionTimeout}ms`,
    );
    return producer;
  }
}

@Injectable()
export class KafkaOutboxEventPublisherDriver implements OutboxEventPublisherDriver {
  readonly name = 'kafka';

  constructor(private readonly publisher: KafkaOutboxEventPublisher) {}

  supports(driver: string): boolean {
    return driver.trim().toLowerCase() === this.name;
  }

  create(): OutboxEventPublisher {
    return this.publisher;
  }
}
