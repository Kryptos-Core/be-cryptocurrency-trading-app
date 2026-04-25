import { Injectable } from '@nestjs/common';
import type {
  OutboxEventPublisher,
  OutboxEventPublisherDriver,
  PublishOutboxRowInput,
  PublishOutboxRowResult,
} from './outbox-event-publisher.port';

/**
 * Default publisher used until Kafka/real broker integration is enabled.
 * Keeps the relay contract stable without introducing external side-effects.
 */
@Injectable()
export class NoopOutboxEventPublisher implements OutboxEventPublisher {
  async publish(_row: PublishOutboxRowInput): Promise<PublishOutboxRowResult> {
    return {
      kafkaPartition: null,
      kafkaOffset: null,
      publishedAt: new Date(),
    };
  }
}

@Injectable()
export class NoopOutboxEventPublisherDriver implements OutboxEventPublisherDriver {
  readonly name = 'noop';

  constructor(private readonly publisher: NoopOutboxEventPublisher) {}

  supports(driver: string): boolean {
    return driver.trim().toLowerCase() === this.name;
  }

  create(): OutboxEventPublisher {
    return this.publisher;
  }
}
