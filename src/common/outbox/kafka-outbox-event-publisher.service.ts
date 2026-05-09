import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Partitioners, type Producer } from 'kafkajs';
import type {
  OutboxEventPublisher,
  OutboxEventPublisherDriver,
  PublishOutboxRowInput,
  PublishOutboxRowResult,
} from './outbox-event-publisher.port';

@Injectable()
export class KafkaOutboxEventPublisher implements OutboxEventPublisher {
  private readonly logger = new Logger(KafkaOutboxEventPublisher.name);
  private producerPromise: Promise<Producer> | null = null;

  constructor(private readonly configService: ConfigService) {}

  async publish(row: PublishOutboxRowInput): Promise<PublishOutboxRowResult> {
    const topic = this.resolveTopic(row);
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
    return {
      kafkaPartition: metadata.partition,
      kafkaOffset: metadata.baseOffset,
      publishedAt: new Date(),
    };
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

    const kafka = new Kafka({
      clientId,
      brokers,
    });

    const producer = kafka.producer({
      // Retain KafkaJS v1.x partitioning behavior (round-robin by default).
      // Remove `createPartitioner` only after the partitioning migration is validated.
      createPartitioner: Partitioners.DefaultPartitioner,
    });
    await producer.connect();
    this.logger.log(`Kafka outbox publisher connected brokers=${brokers.join(',')}`);
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
