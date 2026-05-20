import { Module } from '@nestjs/common';
import {
  makeCounterProvider,
  makeGaugeProvider,
  makeHistogramProvider,
  PrometheusModule,
} from '@willsoto/nestjs-prometheus';
import { MetricsService } from './metrics.service';

@Module({
  imports: [
    PrometheusModule.register({
      defaultMetrics: { enabled: true },
      path: '/metrics',
    }),
  ],
  providers: [
    MetricsService,
    makeHistogramProvider({
      name: 'http_request_duration_seconds',
      help: 'Duration of HTTP requests in seconds',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    }),
    makeGaugeProvider({
      name: 'matching_queue_depth',
      help: 'Number of orders pending matching per trading pair',
      labelNames: ['pair_id'],
    }),
    makeCounterProvider({
      name: 'orders_total',
      help: 'Total number of orders created',
      labelNames: ['order_type', 'side'],
    }),
    makeCounterProvider({
      name: 'trades_total',
      help: 'Total number of trades executed',
      labelNames: ['pair_id'],
    }),
    makeGaugeProvider({
      name: 'outbox_unpublished_rows',
      help: 'Approximate backlog of integration_outbox rows not yet relayed',
      labelNames: ['aggregate_type'],
    }),
    makeGaugeProvider({
      name: 'outbox_dead_letter_rows',
      help: 'Current count of integration_outbox rows in dead-letter state',
    }),
    makeGaugeProvider({
      name: 'outbox_retry_scheduled_rows',
      help: 'Current count of integration_outbox rows waiting for scheduled retry',
    }),
    makeGaugeProvider({
      name: 'outbox_oldest_unpublished_age_seconds',
      help: 'Age in seconds of the oldest unpublished outbox row',
    }),
    makeGaugeProvider({
      name: 'outbox_oldest_dead_letter_age_seconds',
      help: 'Age in seconds of the oldest dead-letter outbox row',
    }),
    makeGaugeProvider({
      name: 'outbox_relay_alert_severity',
      help: 'Outbox relay alert severity (none=0, warning=1, critical=2)',
    }),
    makeCounterProvider({
      name: 'outbox_relay_published_total',
      help: 'Total outbox rows successfully relayed',
      labelNames: ['event_type'],
    }),
    makeCounterProvider({
      name: 'outbox_relay_failures_total',
      help: 'Total outbox relay publish/sync failures',
      labelNames: ['event_type'],
    }),
    makeCounterProvider({
      name: 'outbox_relay_retry_scheduled_total',
      help: 'Total outbox rows scheduled for retry',
      labelNames: ['event_type'],
    }),
    makeCounterProvider({
      name: 'outbox_relay_dead_lettered_total',
      help: 'Total outbox rows moved to dead-letter state',
      labelNames: ['event_type'],
    }),
    makeGaugeProvider({
      name: 'market_read_model_trade_drift',
      help: 'Trade reconciliation drift between core trades and market read model',
      labelNames: ['window_hours'],
    }),
    makeGaugeProvider({
      name: 'market_read_model_ticker_drift',
      help: 'Ticker reconciliation drift between core trades and ticker projection',
      labelNames: ['window_hours'],
    }),
    makeGaugeProvider({
      name: 'market_read_model_ticker_stale_pairs',
      help: 'Number of stale ticker projection rows compared with core trades',
      labelNames: ['window_hours'],
    }),
    makeGaugeProvider({
      name: 'market_read_model_ohlcv_drift',
      help: 'OHLCV reconciliation drift between core trades and OHLCV projection',
      labelNames: ['window_hours', 'interval_sec'],
    }),
    makeGaugeProvider({
      name: 'market_read_model_projection_lag_seconds',
      help: 'Observed lag in seconds for market read-model projections',
      labelNames: ['projection'],
    }),
    makeGaugeProvider({
      name: 'market_read_model_alert_severity',
      help: 'Market read-model alert severity (none=0, warning=1, critical=2)',
    }),
    makeGaugeProvider({
      name: 'matching_shadow_runs',
      help: 'Shadow matching runs captured per pair',
      labelNames: ['pair_id'],
    }),
    makeGaugeProvider({
      name: 'matching_shadow_missing_trades',
      help: 'Estimated missing trades when comparing shadow runs vs executed trades',
      labelNames: ['pair_id'],
    }),
    makeGaugeProvider({
      name: 'matching_shadow_match_rate_percent',
      help: 'Estimated parity rate percentage for shadow matching per pair',
      labelNames: ['pair_id'],
    }),
    makeGaugeProvider({
      name: 'public_ws_parity_compared_pairs',
      help: 'Number of pair samples compared between external ticker ingress and emitted /trading payloads',
      labelNames: ['source'],
    }),
    makeGaugeProvider({
      name: 'public_ws_parity_drift_pairs',
      help: 'Number of pair samples with drift between external ingress and emitted /trading payloads',
      labelNames: ['source'],
    }),
    makeHistogramProvider({
      name: 'blockchain_rpc_duration_seconds',
      help: 'Duration of blockchain RPC calls in seconds',
      labelNames: ['chain', 'method'],
      buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30],
    }),
    // Projection consumer metrics (Phase 5a/5b)
    makeCounterProvider({
      name: 'projection_consumer_processed_total',
      help: 'Total events successfully processed by projection consumers',
      labelNames: ['source'],
    }),
    makeCounterProvider({
      name: 'projection_consumer_failures_total',
      help: 'Total projection consumer processing failures',
      labelNames: ['consumer', 'source'],
    }),
    makeGaugeProvider({
      name: 'projection_consumer_state',
      help: 'Circuit breaker state per projection consumer (CLOSED=0, HALF_OPEN=1, OPEN=2)',
      labelNames: ['consumer'],
    }),
    makeCounterProvider({
      name: 'projection_consumer_skipped_total',
      help: 'Total events skipped by projection consumers',
      labelNames: ['consumer', 'reason'],
    }),
    // Reconciliation metrics (Phase 10)
    makeGaugeProvider({
      name: 'reconciliation_balance_drift_total',
      help: 'Total user balances with drift above threshold',
    }),
    makeGaugeProvider({
      name: 'reconciliation_balance_critical_total',
      help: 'Total user balances with critical drift',
    }),
    makeGaugeProvider({
      name: 'reconciliation_trades_mismatch',
      help: 'Trade count mismatch between PostgreSQL and read model',
      labelNames: ['window_minutes'],
    }),
    makeGaugeProvider({
      name: 'reconciliation_outbox_backlog',
      help: 'Unpublished outbox rows',
    }),
    makeGaugeProvider({
      name: 'reconciliation_dlq_count',
      help: 'Dead-letter queue count',
    }),
    makeGaugeProvider({
      name: 'reconciliation_orderbook_checksum_drift',
      help: 'Orderbook checksum drift between PostgreSQL and Redis',
      labelNames: ['pair_id'],
    }),
    makeGaugeProvider({
      name: 'reconciliation_ohlcv_drift',
      help: 'OHLCV volume drift between PostgreSQL and read model',
      labelNames: ['interval_sec'],
    }),
    makeHistogramProvider({
      name: 'reconciliation_job_duration_seconds',
      help: 'Duration of reconciliation jobs in seconds',
      labelNames: ['job'],
      buckets: [1, 5, 15, 30, 60, 120, 300],
    }),
    // Circuit breaker metrics for Kafka producer (Phase 6)
    makeGaugeProvider({
      name: 'circuit_breaker_state',
      help: 'Circuit breaker state per target (CLOSED=0, HALF_OPEN=1, OPEN=2)',
      labelNames: ['name'],
    }),
    makeCounterProvider({
      name: 'circuit_breaker_tripped_total',
      help: 'Total circuit breaker state transitions to OPEN',
      labelNames: ['name', 'reason'],
    }),
    makeCounterProvider({
      name: 'outbox_dlq_published_total',
      help: 'Total outbox rows published to Kafka DLQ topic',
      labelNames: ['event_type'],
    }),
    makeCounterProvider({
      name: 'outbox_dlq_publish_failures_total',
      help: 'Total failures publishing outbox rows to Kafka DLQ topic',
      labelNames: ['event_type'],
    }),
    makeHistogramProvider({
      name: 'kafka_publish_duration_seconds',
      help: 'Duration of Kafka publish operations in seconds',
      labelNames: ['topic', 'event_type'],
      buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
    }),
    makeHistogramProvider({
      name: 'outbox_flush_duration_seconds',
      help: 'Duration of outbox flush cycles in seconds',
      buckets: [0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60],
    }),
  ],
  exports: [MetricsService],
})
export class TelemetryModule {}
