import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

export type MatchingShadowRunSummary = {
  runId: string;
  pairId: string;
  orderId: string;
  mode: string;
  status: string;
  hasMatchedTrade: boolean;
  createdAt: string;
};

export type MatchingShadowParitySummary = {
  pairId: string;
  windowHours: number;
  shadowRuns: number;
  matchedTrades: number;
  matchedShadowRuns: number;
  unmatchedShadowRuns: number;
  missingTrades: number;
  matchRatePercent: number;
  unmatchedOrderIds: string[];
  recentRuns: MatchingShadowRunSummary[];
};

@Injectable()
export class MatchingShadowReconciliationUseCase {
  constructor(private readonly dataSource: DataSource) {}

  async execute(input: {
    pairId: string;
    windowHours?: number;
    limit?: number;
  }): Promise<MatchingShadowParitySummary> {
    const pairId = (input.pairId ?? '').trim();
    const windowHours = Math.max(1, Math.min(input.windowHours ?? 24, 24 * 30));
    const limit = Math.max(1, Math.min(input.limit ?? 20, 200));

    const [aggregateRows, recentRows, unmatchedRows] = await Promise.all([
      this.dataSource.query(
        `WITH shadow AS (
           SELECT run_id, order_id
             FROM shadow_matching_runs
            WHERE pair_id = $1
              AND created_at >= NOW() - ($2::text || ' hours')::interval
         ),
         matched_shadow AS (
           SELECT COUNT(*)::int AS matched_shadow_runs
             FROM shadow s
            WHERE EXISTS (
              SELECT 1
                FROM trades t
               WHERE t.pair_id = $1
                 AND t.taker_order_id = s.order_id
            )
         ),
         matched_trades AS (
           SELECT COUNT(*)::int AS matched_trades
             FROM trades t
            WHERE t.pair_id = $1
              AND t.created_at >= NOW() - ($2::text || ' hours')::interval
              AND EXISTS (
                SELECT 1
                  FROM shadow s
                 WHERE s.order_id = t.taker_order_id
              )
         )
         SELECT
           (SELECT COUNT(*)::int FROM shadow) AS shadow_runs,
           (SELECT matched_shadow_runs FROM matched_shadow) AS matched_shadow_runs,
           (SELECT matched_trades FROM matched_trades) AS matched_trades`,
        [pairId, String(windowHours)],
      ) as Promise<
        Array<{ shadow_runs: number; matched_shadow_runs: number; matched_trades: number }>
      >,
      this.dataSource.query(
        `SELECT s.run_id, s.pair_id, s.order_id, s.mode, s.status, s.created_at,
                EXISTS (
                  SELECT 1
                    FROM trades t
                   WHERE t.pair_id = s.pair_id
                     AND t.taker_order_id = s.order_id
                ) AS has_matched_trade
           FROM shadow_matching_runs s
          WHERE s.pair_id = $1
            AND s.created_at >= NOW() - ($2::text || ' hours')::interval
          ORDER BY s.created_at DESC
          LIMIT $3`,
        [pairId, String(windowHours), limit],
      ) as Promise<
        Array<{
          run_id: string;
          pair_id: string;
          order_id: string;
          mode: string;
          status: string;
          has_matched_trade: boolean;
          created_at: Date | string;
        }>
      >,
      this.dataSource.query(
        `SELECT s.order_id
           FROM shadow_matching_runs s
          WHERE s.pair_id = $1
            AND s.created_at >= NOW() - ($2::text || ' hours')::interval
            AND NOT EXISTS (
              SELECT 1
                FROM trades t
               WHERE t.pair_id = s.pair_id
                 AND t.taker_order_id = s.order_id
            )
          ORDER BY s.created_at DESC
          LIMIT $3`,
        [pairId, String(windowHours), Math.min(limit, 50)],
      ) as Promise<Array<{ order_id: string }>>,
    ]);

    const shadowRuns = Number(aggregateRows?.[0]?.shadow_runs ?? 0);
    const matchedShadowRuns = Number(aggregateRows?.[0]?.matched_shadow_runs ?? 0);
    const matchedTrades = Number(aggregateRows?.[0]?.matched_trades ?? 0);
    const unmatchedShadowRuns = Math.max(shadowRuns - matchedShadowRuns, 0);
    const missingTrades = unmatchedShadowRuns;

    const matchRatePercent =
      shadowRuns === 0 ? 100 : Math.max(0, Math.min(100, (matchedShadowRuns / shadowRuns) * 100));

    const recentRuns: MatchingShadowRunSummary[] = (recentRows ?? []).map((row) => ({
      runId: row.run_id,
      pairId: row.pair_id,
      orderId: row.order_id,
      mode: row.mode,
      status: row.status,
      hasMatchedTrade: !!row.has_matched_trade,
      createdAt: new Date(row.created_at).toISOString(),
    }));

    const unmatchedOrderIds = (unmatchedRows ?? []).map((row) => row.order_id);

    return {
      pairId,
      windowHours,
      shadowRuns,
      matchedTrades,
      matchedShadowRuns,
      unmatchedShadowRuns,
      missingTrades,
      matchRatePercent,
      unmatchedOrderIds,
      recentRuns,
    };
  }
}
