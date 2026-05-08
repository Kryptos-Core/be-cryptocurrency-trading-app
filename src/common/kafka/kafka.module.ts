import { Module } from '@nestjs/common';
import { KafkaConsumerRunnerService } from './kafka-consumer-runner.service';
import { TelemetryModule } from '@/telemetry';

/**
 * Kafka Module
 *
 * Phase 5d: Kafka Consumer Migration (Optional)
 *
 * Provides Kafka consumer infrastructure for high-volume scenarios.
 *
 * This is OPTIONAL. Phase 5a/5b DB-based approach is sufficient for most cases.
 *
 * When enabled (KAFKA_CONSUMERS_ENABLED=true):
 * - Reads events from Kafka topics
 * - Writes to processed_integration_events (idempotency)
 * - Provides native consumer group + lag metrics
 *
 * When disabled:
 * - Uses DB-based projection consumers (Phase 5a/5b)
 * - Zero Kafka operational overhead
 */
@Module({
  imports: [TelemetryModule],
  providers: [KafkaConsumerRunnerService],
  exports: [KafkaConsumerRunnerService],
})
export class KafkaModule {}
