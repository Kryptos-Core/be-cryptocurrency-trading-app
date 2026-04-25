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
    makeHistogramProvider({
      name: 'blockchain_rpc_duration_seconds',
      help: 'Duration of blockchain RPC calls in seconds',
      labelNames: ['chain', 'method'],
      buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30],
    }),
  ],
  exports: [MetricsService],
})
export class TelemetryModule {}
