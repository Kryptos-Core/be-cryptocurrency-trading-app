import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IOHLCVProvider, OHLCVCandleDto } from '../interfaces/ohlcv-provider.interface';

/** Only daily candles (1d) from Uniswap poolDayData; other intervals fallback to Binance. */
const UNISWAP_SUPPORTED_INTERVAL_SEC = 86400;

/**
 * Uniswap V3 OHLCV provider (on-demand by time range).
 * Uses Uniswap V3 Subgraph (poolDayData): https://docs.uniswap.org/contracts
 * Pool mapping via config (symbol -> pool address). No hardcoded pools.
 */
@Injectable()
export class UniswapV3OHLCVProvider implements IOHLCVProvider {
  readonly name = 'uniswap-v3';

  private readonly subgraphUrl: string;
  private readonly symbolToPoolId: Record<string, string>;

  constructor(private readonly configService: ConfigService) {
    this.subgraphUrl =
      this.configService.get<string>('app.priceOracle.uniswap.subgraphUrl') ||
      'https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3';
    this.symbolToPoolId =
      this.configService.get<Record<string, string>>('app.priceOracle.uniswap.symbolToPoolId') || {};
  }

  async getOHLCVByRange(
    pairId: string,
    symbol: string,
    intervalSec: number,
    fromDate: Date,
    toDate: Date,
    limit: number,
  ): Promise<OHLCVCandleDto[]> {
    if (intervalSec !== UNISWAP_SUPPORTED_INTERVAL_SEC) {
      return [];
    }
    const poolId = this.symbolToPoolId[symbol] || this.symbolToPoolId[this.normalizeSymbol(symbol)];
    if (!poolId) {
      return [];
    }

    const fromDay = Math.floor(fromDate.getTime() / 86400_000);
    const toDay = Math.floor(toDate.getTime() / 86400_000);

    const query = `query PoolDayDatas($pool: String!, $dateGte: Int!, $dateLte: Int!, $first: Int!) {
      poolDayDatas(
        where: { pool: $pool, date_gte: $dateGte, date_lte: $dateLte }
        first: $first
        orderBy: date
        orderDirection: asc
      ) {
        date
        open
        high
        low
        close
        volumeToken0
        volumeToken1
      }
    }`;

    try {
      const res = await fetch(this.subgraphUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          variables: {
            pool: poolId.toLowerCase(),
            dateGte: fromDay,
            dateLte: toDay,
            first: Math.min(limit, 1000),
          },
        }),
      });
      if (!res.ok) return [];
      const json = (await res.json()) as { data?: { poolDayDatas?: unknown[] } };
      const list = json?.data?.poolDayDatas;
      if (!Array.isArray(list)) return [];

      return list.map((d: unknown) => {
        const x = d as Record<string, unknown>;
        return {
          pair_id: pairId,
          interval_sec: intervalSec,
          open_time: new Date(Number(x?.date ?? 0) * 86400 * 1000),
          open: String(x?.open ?? 0),
          high: String(x?.high ?? 0),
          low: String(x?.low ?? 0),
          close: String(x?.close ?? 0),
          volume: String(x?.volumeToken0 ?? 0),
        };
      });
    } catch {
      return [];
    }
  }

  private normalizeSymbol(symbol: string): string {
    return String(symbol).toUpperCase().replace(/[^A-Z0-9]/g, '');
  }
}
