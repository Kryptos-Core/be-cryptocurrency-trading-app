import { Injectable } from '@nestjs/common';
import type { ITradeResultVisitor, TradeExecutionResult } from '../interfaces';

/**
 * Visitor Pattern: Metrics aggregation visitor for trade execution results.
 * Responsibility: accumulate trade volume/count for in-process metrics
 * (exported to Prometheus or logged periodically).
 * Decoupled from MatchingService—registered as an observer callback.
 */
@Injectable()
export class MetricsTradeVisitor implements ITradeResultVisitor {
  private tradeCount = 0;
  private totalVolumeByPair = new Map<string, number>();

  visit(trade: TradeExecutionResult): void {
    this.tradeCount++;
    const prev = this.totalVolumeByPair.get(trade.pair_id) ?? 0;
    this.totalVolumeByPair.set(trade.pair_id, prev + parseFloat(trade.amount));
  }

  /** Snapshot current counters (e.g. for /metrics endpoint). */
  getSnapshot(): { tradeCount: number; volumeByPair: Record<string, number> } {
    return {
      tradeCount: this.tradeCount,
      volumeByPair: Object.fromEntries(this.totalVolumeByPair),
    };
  }
}
