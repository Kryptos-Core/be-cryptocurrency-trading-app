import { Module } from '@nestjs/common';
import {
  makeCounterProvider,
  makeGaugeProvider,
  makeHistogramProvider,
  PrometheusModule,
} from '@willsoto/nestjs-prometheus';
import { MetricsService } from './metrics.service';

/**
 * TelemetryModule — NestJS module for Prometheus metrics.
 *
 * Registers Prometheus metrics at GET /metrics (default PrometheusModule route).
 *
 * OpenTelemetry tracing is initialised separately via src/telemetry/tracing.ts
 * (loaded before NestJS via --require).
 *
 * Import this module in AppModule:
 * ```typescript
 * @Module({
 *   imports: [TelemetryModule, ...],
 * })
 * export class AppModule {}
 * ```
 */
@Module({
  imports: [
    PrometheusModule.register({
      defaultMetrics: { enabled: true },
      path: '/metrics',
    }),
  ],
  providers: [
    MetricsService,

    // ── HTTP ──────────────────────────────────────────────────────────────
    makeHistogramProvider({
      name: 'http_request_duration_seconds',
      help: 'Duration of HTTP requests in seconds',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    }),

    // ── Matching / Order Book ─────────────────────────────────────────────
    makeGaugeProvider({
      name: 'matching_queue_depth',
      help: 'Number of orders pending matching per trading pair',
      labelNames: ['pair_id'],
    }),

    // ── Orders ────────────────────────────────────────────────────────────
    makeCounterProvider({
      name: 'orders_total',
      help: 'Total number of orders created',
      labelNames: ['order_type', 'side'],
    }),

    // ── Trades ────────────────────────────────────────────────────────────
    makeCounterProvider({
      name: 'trades_total',
      help: 'Total number of trades executed',
      labelNames: ['pair_id'],
    }),

    // ── Blockchain RPC ────────────────────────────────────────────────────
    makeGaugeProvider({
      name: 'outbox_unpublished_rows',
      help: 'Approximate backlog of integration_outbox rows not yet relayed (updated by relay job when instrumented)',
      labelNames: ['aggregate_type'],
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
