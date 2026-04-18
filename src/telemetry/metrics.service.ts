import { Injectable } from '@nestjs/common';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Counter, Gauge, Histogram } from 'prom-client';

/**
 * MetricsService — centralised Prometheus metrics for the trading backend.
 *
 * Exposes:
 *  - HTTP request duration histogram (auto-populated by interceptor)
 *  - Matching queue depth gauge
 *  - Order throughput counter (by type and side)
 *  - Trade throughput counter
 *  - Blockchain RPC latency histogram
 */
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
}
