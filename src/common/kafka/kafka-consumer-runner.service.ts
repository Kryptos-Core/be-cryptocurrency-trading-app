import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Consumer, EachMessagePayload, Admin } from 'kafkajs';
import { MetricsService } from '@/telemetry/metrics.service';
import {
  CircuitBreaker,
  CircuitBreakerRegistry,
  CircuitBreakerState,
} from '@/common/outbox/circuit-breaker';
import { PROJECTION_CONSUMERS } from '@/common/outbox/projection-consumer-runner.service';

/**
 * Kafka Consumer Configuration
 */
export interface KafkaConsumerConfig {
  brokers: string[];
  clientId: string;
  groupIdPrefix: string;
  sessionTimeout: number;
  heartbeatInterval: number;
}

/**
 * Kafka Topic Consumer
 */
export interface KafkaTopicConsumer {
  topic: string;
  consumerGroup: string;
  fromBeginning: boolean;
}

/**
 * KafkaConsumerRunnerService
 *
 * Phase 5d: Kafka Consumer Migration (Optional)
 *
 * Reads events from Kafka topics instead of processed_integration_events.
 * This is an optional migration for high-volume scenarios.
 *
 * Migration Plan:
 * 1. Kafka consumer reads from topic (instead of processed_integration_events)
 * 2. Still writes to processed_integration_events (idempotency gate)
 * 3. Phase 5b/5c consumers run in parallel
 * 4. After stable → disable DB-based consumers
 * 5. processed_integration_events becomes pure idempotency
 *
 * Benefits:
 * - Offset-based consumption (no polling)
 * - Native consumer group + lag metrics
 * - Simpler replay (seek to offset)
 *
 * Note: This is OPTIONAL. Phase 5a/5b DB-based approach is sufficient for most cases.
 */
@Injectable()
export class KafkaConsumerRunnerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaConsumerRunnerService.name);
  private kafka: Kafka | null = null;
  private consumers: Map<string, Consumer> = new Map();
  private circuitBreakerRegistry: CircuitBreakerRegistry;
  private isRunning = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly metricsService: MetricsService,
  ) {
    this.circuitBreakerRegistry = new CircuitBreakerRegistry(this.logger);
  }

  /**
   * Check if Kafka consumers are enabled
   */
  isEnabled(): boolean {
    return this.configService.get<string>('KAFKA_CONSUMERS_ENABLED') === 'true';
  }

  async onModuleInit(): Promise<void> {
    if (!this.isEnabled()) {
      this.logger.log('Kafka consumers disabled (KAFKA_CONSUMERS_ENABLED=false)');
      return;
    }

    await this.initializeKafka();
    await this.startConsumers();
  }

  async onModuleDestroy(): Promise<void> {
    await this.stopConsumers();
  }

  private async initializeKafka(): Promise<void> {
    const brokers = this.parseBrokers();
    const clientId = this.configService.get<string>('KAFKA_CLIENT_ID') ?? 'crypto-trading-backend';

    this.kafka = new Kafka({
      clientId,
      brokers,
      retry: {
        initialRetryTime: 100,
        retries: 8,
      },
    });

    this.logger.log(`Kafka initialized: brokers=${brokers.join(',')} clientId=${clientId}`);

    // Initialize circuit breakers
    for (const consumerName of Object.values(PROJECTION_CONSUMERS)) {
      const cb = this.circuitBreakerRegistry.getOrCreate(consumerName);
      this.metricsService.setProjectionConsumerState(consumerName, CircuitBreakerState.CLOSED);
    }
  }

  private parseBrokers(): string[] {
    const brokersEnv = this.configService.get<string>('KAFKA_BROKERS');
    if (!brokersEnv) {
      return ['127.0.0.1:9092'];
    }
    return brokersEnv.split(',').map((b) => b.trim()).filter(Boolean);
  }

  private async startConsumers(): Promise<void> {
    if (!this.kafka) {
      this.logger.warn('Kafka not initialized');
      return;
    }

    const topics = this.getTopicsToConsume();
    const groupIdPrefix = this.configService.get<string>('KAFKA_CONSUMER_GROUP_PREFIX') ?? 'crypto-trading';

    for (const topicConfig of topics) {
      const consumerGroup = `${groupIdPrefix}-${topicConfig.consumerGroup}`;

      try {
        const consumer = this.kafka.consumer({
          groupId: consumerGroup,
          sessionTimeout: 30000,
          heartbeatInterval: 3000,
        });

        await consumer.connect();
        await consumer.subscribe({
          topic: topicConfig.topic,
          fromBeginning: topicConfig.fromBeginning,
        });

        await consumer.run({
          eachMessage: async (payload) => {
            await this.handleMessage(consumerGroup, payload);
          },
        });

        this.consumers.set(consumerGroup, consumer);
        this.logger.log(`Kafka consumer started: topic=${topicConfig.topic} group=${consumerGroup}`);
      } catch (error) {
        this.logger.error(
          `Failed to start Kafka consumer for ${topicConfig.topic}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    this.isRunning = true;
  }

  private getTopicsToConsume(): KafkaTopicConsumer[] {
    // Map topics to consumer groups based on event type
    return [
      {
        topic: 'crypto.orders.created',
        consumerGroup: 'orders-consumer',
        fromBeginning: false,
      },
      {
        topic: 'crypto.orders.cancelled',
        consumerGroup: 'orders-consumer',
        fromBeginning: false,
      },
      {
        topic: 'crypto.trades.executed',
        consumerGroup: 'trades-consumer',
        fromBeginning: false,
      },
      {
        topic: 'crypto.wallet_ledger.created',
        consumerGroup: 'wallet-consumer',
        fromBeginning: false,
      },
      {
        topic: 'crypto.market.ticker',
        consumerGroup: 'market-consumer',
        fromBeginning: false,
      },
      {
        topic: 'crypto.market.ohlcv',
        consumerGroup: 'market-consumer',
        fromBeginning: false,
      },
      {
        topic: 'crypto.market.orderbook',
        consumerGroup: 'market-consumer',
        fromBeginning: false,
      },
    ];
  }

  private async handleMessage(
    consumerGroup: string,
    payload: EachMessagePayload,
  ): Promise<void> {
    const { topic, partition, message } = payload;

    if (!message.value) {
      this.logger.warn(`Empty message on ${topic}`);
      return;
    }

    const eventId = message.headers?.['event_id']
      ? String(message.headers['event_id'])
      : `unknown-${Date.now()}`;
    const eventType = message.headers?.['event_type']
      ? String(message.headers['event_type'])
      : 'unknown';

    this.logger.debug(
      `Kafka message: topic=${topic} partition=${partition} offset=${message.offset} eventId=${eventId}`,
    );

    // Determine which consumer handles this event
    const consumerName = this.getConsumerForTopic(topic);
    const circuitBreaker = this.circuitBreakerRegistry.get(consumerName);

    // Check circuit breaker
    if (circuitBreaker && !circuitBreaker.isAllowed()) {
      this.logger.warn(
        `Circuit breaker OPEN for consumer=${consumerName}, skipping event ${eventId}`,
      );
      this.metricsService.incrementProjectionConsumerSkipped(consumerName, 'circuit_open');
      return;
    }

    try {
      // Process the message
      await this.processMessage(topic, message.value);

      // Record success
      circuitBreaker?.recordSuccess();
      this.metricsService.incrementProjectionConsumerProcessed(1);
    } catch (error) {
      this.logger.error(
        `Failed to process Kafka message: ${error instanceof Error ? error.message : String(error)}`,
      );

      // Record failure
      circuitBreaker?.recordFailure();
      this.metricsService.incrementProjectionConsumerFailures(consumerName);

      // Update metrics
      this.metricsService.setProjectionConsumerState(
        consumerName,
        circuitBreaker?.getState() ?? CircuitBreakerState.CLOSED,
      );
    }
  }

  private async processMessage(topic: string, value: Buffer): Promise<void> {
    // Parse message
    const event = JSON.parse(value.toString());

    // Determine consumer based on topic
    // In production, this would call the appropriate projection applier
    this.logger.debug(`Processing event from ${topic}: ${JSON.stringify(event).slice(0, 200)}...`);
  }

  private getConsumerForTopic(topic: string): string {
    if (topic.includes('orders')) {
      return PROJECTION_CONSUMERS.marketPairReadModel;
    }
    if (topic.includes('trades')) {
      return PROJECTION_CONSUMERS.tradeReadModel;
    }
    if (topic.includes('wallet') || topic.includes('balance')) {
      return PROJECTION_CONSUMERS.onchainDepositReadModel;
    }
    if (topic.includes('ticker') || topic.includes('ohlcv') || topic.includes('orderbook')) {
      return PROJECTION_CONSUMERS.marketTickerReadModel;
    }
    return PROJECTION_CONSUMERS.marketPairReadModel;
  }

  private async stopConsumers(): Promise<void> {
    this.isRunning = false;

    for (const [groupId, consumer] of this.consumers.entries()) {
      try {
        await consumer.disconnect();
        this.logger.log(`Kafka consumer disconnected: group=${groupId}`);
      } catch (error) {
        this.logger.error(
          `Error disconnecting consumer ${groupId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    this.consumers.clear();
  }

  /**
   * Get consumer lag metrics
   */
  async getConsumerLag(): Promise<Array<{
    topic: string;
    groupId: string;
    partition: number;
    lag: number;
    committed: string;
  }>> {
    const lagResults: Array<{
      topic: string;
      groupId: string;
      partition: number;
      lag: number;
      committed: string;
    }> = [];

    if (!this.kafka) {
      return lagResults;
    }

    try {
      const admin: Admin = this.kafka.admin();
      await admin.connect();

      for (const [groupId] of this.consumers.entries()) {
        const offsets = await admin.fetchOffsets({ groupId });
        for (const topicOffsets of offsets) {
          for (const partition of topicOffsets.partitions) {
            lagResults.push({
              topic: topicOffsets.topic,
              groupId,
              partition: partition.partition,
              lag: 0, // Would need listOffsets to calculate lag
              committed: partition.offset,
            });
          }
        }
      }

      await admin.disconnect();
    } catch (error) {
      this.logger.error(
        `Failed to get consumer lag: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return lagResults;
  }

  /**
   * Get circuit breaker metrics
   */
  getCircuitBreakerMetrics() {
    return this.circuitBreakerRegistry.getAllMetrics();
  }
}
