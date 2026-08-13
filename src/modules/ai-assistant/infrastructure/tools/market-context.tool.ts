import { Injectable, Logger } from '@nestjs/common';
import { MarketsService } from '@/modules/markets/markets.service';
import type { ToolContext, ToolDefinition } from '../../strategies/context-builder.strategy';

/**
 * Read-only market context tools. No mutation; only safe ticker/OHLCV.
 */
@Injectable()
export class MarketContextTool {
  private readonly logger = new Logger(MarketContextTool.name);

  constructor(private readonly marketsService: MarketsService) {}

  definitions(): ToolDefinition[] {
    return [
      {
        name: 'get_ticker',
        handler: async (args, _ctx: ToolContext) => {
          const symbol = String(args.symbol ?? '').trim();
          if (!symbol) {
            return { error: 'symbol is required' };
          }
          try {
            const ticker = await this.marketsService.getTickerBySymbol(symbol);
            return {
              symbol: ticker.symbol ?? symbol,
              last_price: ticker.lastPrice ?? null,
              change_24h: ticker.change24h ?? null,
              volume_24h: ticker.volume24h ?? null,
              high_24h: ticker.high24h ?? null,
              low_24h: ticker.low24h ?? null,
            };
          } catch (err) {
            this.logger.warn(`get_ticker failed for ${symbol}: ${(err as Error).message}`);
            return { error: `Không lấy được ticker cho ${symbol}` };
          }
        },
      },
      {
        name: 'get_ohlcv',
        handler: async (args) => {
          const symbol = String(args.symbol ?? '').trim();
          const interval = String(args.interval ?? '1h');
          const limit = Math.min(Math.max(Number(args.limit ?? 50), 1), 500);
          if (!symbol) {
            return { error: 'symbol is required' };
          }
          try {
            const candles = await this.marketsService.getOHLCV(symbol, limit, undefined, 'en', interval);
            const arr = Array.isArray(candles) ? candles : (candles as { data?: unknown[] })?.data ?? [];
            return {
              symbol,
              interval,
              count: Array.isArray(arr) ? arr.length : 0,
              candles: arr,
            };
          } catch (err) {
            this.logger.warn(`get_ohlcv failed for ${symbol}: ${(err as Error).message}`);
            return { error: `Không lấy được OHLCV cho ${symbol} (${interval})` };
          }
        },
      },
    ];
  }
}
