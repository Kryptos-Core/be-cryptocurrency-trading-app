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

    @InjectMetric('outbox_oldest_unpublished_age_seconds')
    private readonly outboxOldestUnpublishedAgeSeconds: Gauge,

    @InjectMetric('outbox_oldest_dead_letter_age_seconds')
    private readonly outboxOldestDeadLetterAgeSeconds: Gauge,

    @InjectMetric('outbox_relay_alert_severity')
    private readonly outboxRelayAlertSeverity: Gauge,

    @InjectMetric('outbox_relay_published_total')
    private readonly outboxRelayPublishedTotal: Counter,

    @InjectMetric('outbox_relay_failures_total')
    private readonly outboxRelayFailuresTotal: Counter,

    @InjectMetric('outbox_relay_retry_scheduled_total')
    private readonly outboxRelayRetryScheduledTotal: Counter,

    @InjectMetric('outbox_relay_dead_lettered_total')
    private readonly outboxRelayDeadLetteredTotal: Counter,

    @InjectMetric('market_read_model_trade_drift')
    private readonly marketReadModelTradeDrift: Gauge,

    @InjectMetric('market_read_model_ticker_drift')
    private readonly marketReadModelTickerDrift: Gauge,

    @InjectMetric('market_read_model_ticker_stale_pairs')
    private readonly marketReadModelTickerStalePairs: Gauge,

    @InjectMetric('market_read_model_ohlcv_drift')
    private readonly marketReadModelOhlcvDrift: Gauge,

    @InjectMetric('market_read_model_projection_lag_seconds')
    private readonly marketReadModelProjectionLagSeconds: Gauge,

    @InjectMetric('market_read_model_alert_severity')
    private readonly marketReadModelAlertSeverity: Gauge,

    @InjectMetric('matching_shadow_runs')
    private readonly matchingShadowRuns: Gauge,

    @InjectMetric('matching_shadow_missing_trades')
    private readonly matchingShadowMissingTrades: Gauge,

    @InjectMetric('matching_shadow_match_rate_percent')
    private readonly matchingShadowMatchRatePercent: Gauge,

    @InjectMetric('public_ws_parity_compared_pairs')
    private readonly publicWsParityComparedPairs: Gauge,

    @InjectMetric('public_ws_parity_drift_pairs')
    private readonly publicWsParityDriftPairs: Gauge,
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

  setOutboxOldestUnpublishedAgeSeconds(ageSeconds: number): void {
    this.outboxOldestUnpublishedAgeSeconds.set(ageSeconds);
  }

  setOutboxOldestDeadLetterAgeSeconds(ageSeconds: number): void {
    this.outboxOldestDeadLetterAgeSeconds.set(ageSeconds);
  }

  setOutboxRelayAlertSeverity(level: number): void {
    this.outboxRelayAlertSeverity.set(level);
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

  setMarketReadModelTradeDrift(windowHours: number, drift: number): void {
    this.marketReadModelTradeDrift.set({ window_hours: String(windowHours) }, drift);
  }

  setMarketReadModelTickerDrift(windowHours: number, drift: number): void {
    this.marketReadModelTickerDrift.set({ window_hours: String(windowHours) }, drift);
  }

  setMarketReadModelTickerStalePairs(windowHours: number, count: number): void {
    this.marketReadModelTickerStalePairs.set({ window_hours: String(windowHours) }, count);
  }

  setMarketReadModelOhlcvDrift(windowHours: number, intervalSec: number, drift: number): void {
    this.marketReadModelOhlcvDrift.set(
      { window_hours: String(windowHours), interval_sec: String(intervalSec) },
      drift,
    );
  }

  setMarketReadModelProjectionLagSeconds(projection: string, lagSeconds: number): void {
    this.marketReadModelProjectionLagSeconds.set({ projection }, lagSeconds);
  }

  setMarketReadModelAlertSeverity(level: number): void {
    this.marketReadModelAlertSeverity.set(level);
  }

  setMatchingShadowRuns(pairId: string, value: number): void {
    this.matchingShadowRuns.set({ pair_id: pairId }, value);
  }

  setMatchingShadowMissingTrades(pairId: string, value: number): void {
    this.matchingShadowMissingTrades.set({ pair_id: pairId }, value);
  }

  setMatchingShadowMatchRatePercent(pairId: string, value: number): void {
    this.matchingShadowMatchRatePercent.set({ pair_id: pairId }, value);
  }

  setPublicWsParityComparedPairs(source: string, value: number): void {
    this.publicWsParityComparedPairs.set({ source }, value);
  }

  setPublicWsParityDriftPairs(source: string, value: number): void {
    this.publicWsParityDriftPairs.set({ source }, value);
  }
}
