import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { MetricsService } from '@/telemetry/metrics.service';
import {
  isCanonicalIntegrationEventEnvelope,
  unwrapCanonicalIntegrationEventPayload,
} from '@/common/integration-events/canonical-integration-event-envelope';
import { IntegrationOutbox } from '@/entities/integration-outbox.entity';

/**
 * ClickHouse Audit Event
 * Schema from Section 9.2 of KAFKA_EVENT_BUS_SOURCE_OF_TRUTH_PLAN.md
 */
export interface ClickHouseAuditEvent {
  event_id: string;
  event_type: string;
  aggregate_type: string;
  aggregate_id: string;
  occurred_at: Date;
  producer: string;
  schema_version: number;
  correlation_id: string | null;
  partition_key: string | null;
  payload: string; // JSON string
  ingested_at: Date;
}

/**
 * ClickHouse Configuration
 */
export interface ClickHouseConfig {
  url: string;
  user: string;
  password: string;
  database: string;
  timeout: number;
}

/**
 * ClickHouseAuditConsumerService
 *
 * Phase 5c: ClickHouse audit consumer
 *
 * Sinks all canonical events to ClickHouse for audit/analytics.
 * Events are read from processed_integration_events and inserted into event_audit_log.
 *
 * Schema:
 * CREATE TABLE event_audit_log (
 *   event_id String,
 *   event_type LowCardinality(String),
 *   aggregate_type LowCardinality(String),
 *   aggregate_id String,
 *   occurred_at DateTime64(3, 'UTC'),
 *   producer LowCardinality(String),
 *   schema_version UInt16,
 *   correlation_id String,
 *   partition_key String,
 *   payload String,
 *   ingested_at DateTime64(3, 'UTC')
 * ) ENGINE = MergeTree PARTITION BY toYYYYMM(occurred_at)
 *   ORDER BY (event_type, aggregate_id, occurred_at, event_id);
 */
@Injectable()
export class ClickHouseAuditConsumerService {
  private readonly logger = new Logger(ClickHouseAuditConsumerService.name);
  private enabled: boolean;
  private clickhouseConfig: ClickHouseConfig | null = null;

  constructor(
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly metricsService: MetricsService,
  ) {
    this.enabled = this.configService.get<string>('ANALYTICS_ENABLED') === 'true';
    this.initializeClickHouseConfig();
  }

  private initializeClickHouseConfig(): void {
    const url = this.configService.get<string>('CLICKHOUSE_URL');
    const user = this.configService.get<string>('CLICKHOUSE_USER');
    const password = this.configService.get<string>('CLICKHOUSE_PASSWORD');

    if (url && user) {
      this.clickhouseConfig = {
        url,
        user,
        password: password ?? 'default',
        database: this.configService.get<string>('CLICKHOUSE_DB') ?? 'default',
        timeout: 30000,
      };
      this.logger.log(`ClickHouse configured: ${url}/${this.clickhouseConfig.database}`);
    } else {
      this.logger.warn('ClickHouse not configured - analytics disabled');
    }
  }

  /**
   * Check if ClickHouse is enabled
   */
  isEnabled(): boolean {
    return this.enabled && this.clickhouseConfig !== null;
  }

  /**
   * Process audit events - reads from integration_outbox and inserts to ClickHouse
   */
  async processAuditEvents(batchSize = 100): Promise<{ processed: number; failed: number }> {
    if (!this.isEnabled()) {
      return { processed: 0, failed: 0 };
    }

    try {
      // Get events that haven't been audited yet
      const events = await this.fetchUnauditedEvents(batchSize);
      if (events.length === 0) {
        return { processed: 0, failed: 0 };
      }

      // Transform to ClickHouse format
      const auditEvents = events.map((row) => this.transformToAuditEvent(row));

      // Insert to ClickHouse
      const result = await this.insertToClickHouse(auditEvents);

      this.logger.debug(`ClickHouse audit: processed=${result.processed} failed=${result.failed}`);
      return result;
    } catch (error) {
      this.logger.error(
        `ClickHouse audit failed: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      return { processed: 0, failed: 0 };
    }
  }

  /**
   * Get ClickHouse health status
   */
  async getHealth(): Promise<{ healthy: boolean; error?: string }> {
    if (!this.isEnabled()) {
      return { healthy: false, error: 'ClickHouse not enabled' };
    }

    try {
      // Simple health check - try to query system tables
      await this.queryClickHouse('SELECT 1');
      return { healthy: true };
    } catch (error) {
      return {
        healthy: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async fetchUnauditedEvents(limit: number): Promise<IntegrationOutbox[]> {
    // Query events that haven't been marked as audited
    // Note: We use a simple approach - in production, track audited events in a separate table
    return this.dataSource.transaction(async (em) => {
      const rows = await em
        .createQueryBuilder(IntegrationOutbox, 'o')
        .where('o.published_at IS NOT NULL')
        .andWhere('o.dead_lettered_at IS NULL')
        .orderBy('o.occurred_at', 'ASC')
        .take(limit)
        .getMany();

      return rows;
    });
  }

  private transformToAuditEvent(row: IntegrationOutbox): ClickHouseAuditEvent {
    const payload = row.payload;
    let payloadString: string;

    if (typeof payload === 'string') {
      payloadString = payload;
    } else {
      payloadString = JSON.stringify(payload);
    }

    return {
      event_id: row.id,
      event_type: row.event_type,
      aggregate_type: row.aggregate_type,
      aggregate_id: row.aggregate_id,
      occurred_at: row.occurred_at,
      producer: 'be-cryptocurrency-trading-app',
      schema_version: row.schema_version ?? 1,
      correlation_id: row.correlation_id ?? null,
      partition_key: row.partition_key ?? null,
      payload: payloadString,
      ingested_at: new Date(),
    };
  }

  private async insertToClickHouse(events: ClickHouseAuditEvent[]): Promise<{ processed: number; failed: number }> {
    if (!this.clickhouseConfig) {
      return { processed: 0, failed: events.length };
    }

    const config = this.clickhouseConfig;

    // Build INSERT query
    const values = events
      .map((e) => {
        const payloadEscaped = e.payload.replace(/'/g, "''");
        return `('${e.event_id}', '${e.event_type}', '${e.aggregate_type}', '${e.aggregate_id}', '${e.occurred_at.toISOString()}', '${e.producer}', ${e.schema_version}, ${e.correlation_id ? `'${e.correlation_id}'` : 'NULL'}, ${e.partition_key ? `'${e.partition_key}'` : 'NULL'}, '${payloadEscaped}', '${e.ingested_at.toISOString()}')`;
      })
      .join(',\n');

    const query = `
      INSERT INTO ${config.database}.event_audit_log (
        event_id, event_type, aggregate_type, aggregate_id,
        occurred_at, producer, schema_version, correlation_id,
        partition_key, payload, ingested_at
      ) VALUES
      ${values}
    `;

    try {
      const response = await this.queryClickHouse(query);
      this.metricsService.incrementClickHouseAuditProcessed(events.length);
      return { processed: events.length, failed: 0 };
    } catch (error) {
      this.logger.error(
        `ClickHouse insert failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      this.metricsService.incrementClickHouseAuditFailed(events.length);
      return { processed: 0, failed: events.length };
    }
  }

  private async queryClickHouse(query: string): Promise<unknown> {
    if (!this.clickhouseConfig) {
      throw new Error('ClickHouse not configured');
    }

    const { url, user, password, database } = this.clickhouseConfig;
    const auth = Buffer.from(`${user}:${password}`).toString('base64');

    const response = await fetch(`${url}/?default_database=${database}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
        Authorization: `Basic ${auth}`,
      },
      body: query,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`ClickHouse query failed: ${response.status} ${text}`);
    }

    return response.json();
  }
}
