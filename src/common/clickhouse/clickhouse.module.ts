import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClickHouseAuditConsumerService } from './clickhouse-audit-consumer.service';
import { IntegrationOutbox } from '@/entities/integration-outbox.entity';
import { TelemetryModule } from '@/telemetry';

/**
 * ClickHouse Module
 *
 * Phase 5c: ClickHouse audit consumer
 *
 * Provides ClickHouse integration for event audit/analytics.
 * Events are sunk from integration_outbox to ClickHouse event_audit_log table.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([IntegrationOutbox]),
    TelemetryModule,
  ],
  providers: [ClickHouseAuditConsumerService],
  exports: [ClickHouseAuditConsumerService],
})
export class ClickHouseModule {}
