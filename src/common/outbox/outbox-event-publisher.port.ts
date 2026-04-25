export interface PublishOutboxRowInput {
  id: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
  schemaVersion: number;
  correlationId?: string | null;
  causationId?: string | null;
  partitionKey?: string | null;
  kafkaTopic?: string | null;
}

export interface PublishOutboxRowResult {
  kafkaPartition?: number | null;
  kafkaOffset?: string | null;
  publishedAt?: Date;
}

/**
 * External publisher abstraction for integration_outbox rows.
 *
 * Current default implementation is a no-op so existing in-process relay behavior
 * remains unchanged while the contract becomes Kafka-ready.
 */
export interface OutboxEventPublisher {
  publish(row: PublishOutboxRowInput): Promise<PublishOutboxRowResult | undefined>;
}

export interface OutboxEventPublisherDriver {
  readonly name: string;
  supports(driver: string): boolean;
  create(): Promise<OutboxEventPublisher> | OutboxEventPublisher;
}
