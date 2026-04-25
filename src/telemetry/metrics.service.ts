import { Injectable } from '@nestjs/common';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Counter, Gauge, Histogram } from 'prom-client';

@Injectable()
export class MetricsService {
  constructor(
    @InjectMetric('http_request_duration_seconds')
    private readonly httpDuration: Histogram,

    @InjectMetric('matching_queue_depth')
    private readonly matchingQueueDepth: Gauge,

    @InjectMetric('orders_total')
    private readonly ordersTotal: Counter,

    @InjectMetric('trades_total')
    private readonly tradesTotal: Counter,

    @InjectMetric('blockchain_rpc_duration_seconds')
    private readonly rpcDuration: Histogram,

    @InjectMetric('outbox_unpublished_rows')
    private readonly outboxUnpublishedRows: Gauge,

    @InjectMetric('outbox_dead_letter_rows')
    private readonly outboxDeadLetterRows: Gauge,

    @InjectMetric('outbox_retry_scheduled_rows')
    private readonly outboxRetryScheduledRows: Gauge,

    @InjectMetric('outbox_relay_published_total')
    private readonly outboxRelayPublishedTotal: Counter,

    @InjectMetric('outbox_relay_failures_total')
    private readonly outboxRelayFailuresTotal: Counter,

    @InjectMetric('outbox_relay_retry_scheduled_total')
    private readonly outboxRelayRetryScheduledTotal: Counter,

    @InjectMetric('outbox_relay_dead_lettered_total')
    private readonly outboxRelayDeadLetteredTotal: Counter,
  ) {}

  recordHttpRequest(method: string, route: string, statusCode: number, durationMs: number): void {
    this.httpDuration.observe(
      { method, route, status_code: String(statusCode) },
      durationMs / 1000,
    );
  }

  setMatchingQueueDepth(pairId: string, depth: number): void {
    this.matchingQueueDepth.set({ pair_id: pairId }, depth);
  }

  incrementOrdersTotal(orderType: string, side: string): void {
    this.ordersTotal.inc({ order_type: orderType, side });
  }

  incrementTradesTotal(pairId: string): void {
    this.tradesTotal.inc({ pair_id: pairId });
  }

  recordRpcDuration(chain: string, method: string, durationMs: number): void {
    this.rpcDuration.observe({ chain, method }, durationMs / 1000);
  }

  setOutboxBacklog(aggregateType: string, count: number): void {
    this.outboxUnpublishedRows.set({ aggregate_type: aggregateType }, count);
  }

  setOutboxDeadLetterRows(count: number): void {
    this.outboxDeadLetterRows.set(count);
  }

  setOutboxRetryScheduledRows(count: number): void {
    this.outboxRetryScheduledRows.set(count);
  }

  incrementOutboxRelayPublished(eventType: string): void {
    this.outboxRelayPublishedTotal.inc({ event_type: eventType });
  }

  incrementOutboxRelayFailure(eventType: string): void {
    this.outboxRelayFailuresTotal.inc({ event_type: eventType });
  }

  incrementOutboxRelayRetryScheduled(eventType: string): void {
    this.outboxRelayRetryScheduledTotal.inc({ event_type: eventType });
  }

  incrementOutboxRelayDeadLettered(eventType: string): void {
    this.outboxRelayDeadLetteredTotal.inc({ event_type: eventType });
  }
}
