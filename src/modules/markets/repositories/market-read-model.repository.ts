import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { DataSource, Repository } from 'typeorm';
import { ReadMarketOhlcv } from '@/entities/read-market-ohlcv.entity';
import { ReadMarketTicker } from '@/entities/read-market-ticker.entity';
import { ReadMarketTrade } from '@/entities/read-market-trade.entity';
import { MARKET_TS_DB } from '@/config';
import type { MarketRecentTradeResponse } from '@/modules/markets/markets.service';
import type { MarketTickerDto } from '../dto';

@Injectable()
export class MarketReadModelRepository {
  private readonly marketReadSource: string;
  private readonly marketTsEnabled: boolean;

  constructor(
    private readonly configService: ConfigService,
    @Inject(MARKET_TS_DB) private readonly marketTsDb: DataSource | null,
  ) {
    this.marketReadSource = (this.configService.get<string>('MARKET_READ_SOURCE') ?? 'postgres')
      .trim()
      .toLowerCase();
    this.marketTsEnabled = String(this.configService.get<string>('MARKET_TS_ENABLED') ?? 'false')
      .trim()
      .toLowerCase() === 'true';
  }

  shouldUseReadModel(): boolean {
    return this.marketReadSource === 'timescale' && this.marketTsEnabled && !!this.marketTsDb;
  }

  async resolvePairIdBySymbol(symbol: string): Promise<string | null> {
    const repository = this.getRepository(ReadMarketTicker);
    const row = await repository.findOne({ where: { symbol: symbol.toUpperCase() } });
    return row?.pair_id ?? null;
  }

  async getRecentTrades(pairId: string, limit = 50): Promise<MarketRecentTradeResponse[]> {
    const repository = this.getRepository(ReadMarketTrade);
    const rows = await repository.find({
      where: { pair_id: pairId },
      order: { executed_at: 'DESC' },
      take: limit,
    });

    return rows.map((row) => ({
      trade_id: row.trade_id,
      pair_id: row.pair_id,
      price: row.price,
      amount: row.amount,
      side: 'BUY',
      created_at: row.executed_at,
    }));
  }

  async getRecentTradesBySymbol(symbol: string, limit = 50): Promise<MarketRecentTradeResponse[]> {
    const pairId = await this.resolvePairIdBySymbol(symbol);
    if (!pairId) return [];
    return this.getRecentTrades(pairId, limit);
  }

  async getTicker(pairId: string): Promise<MarketTickerDto | null> {
    const repository = this.getRepository(ReadMarketTicker);
    const row = await repository.findOne({ where: { pair_id: pairId } });
    if (!row) return null;

    return {
      symbol: row.symbol,
      pairId: row.pair_id,
      lastPrice: row.last_price,
      high24h: row.high_24h,
      low24h: row.low_24h,
      volume24h: row.volume_24h,
      quoteVolume24h: row.volume_24h_usd,
      change24h: row.change_percent_24h,
      changeAmount24h: row.change_24h,
      bestBid: row.best_bid,
      bestAsk: row.best_ask,
      open24h: row.open_24h,
      timestamp: row.ticker_timestamp.toISOString(),
    };
  }

  async getTickerBySymbol(symbol: string): Promise<MarketTickerDto | null> {
    const repository = this.getRepository(ReadMarketTicker);
    const row = await repository.findOne({ where: { symbol: symbol.toUpperCase() } });
    if (!row) return null;
    return {
      symbol: row.symbol,
      pairId: row.pair_id,
      lastPrice: row.last_price,
      high24h: row.high_24h,
      low24h: row.low_24h,
      volume24h: row.volume_24h,
      quoteVolume24h: row.volume_24h_usd,
      change24h: row.change_percent_24h,
      changeAmount24h: row.change_24h,
      bestBid: row.best_bid,
      bestAsk: row.best_ask,
      open24h: row.open_24h,
      timestamp: row.ticker_timestamp.toISOString(),
    };
  }

  async getAllTickers(): Promise<MarketTickerDto[]> {
    const repository = this.getRepository(ReadMarketTicker);
    const rows = await repository.find({ order: { symbol: 'ASC' } });
    return rows.map((row) => ({
      symbol: row.symbol,
      pairId: row.pair_id,
      lastPrice: row.last_price,
      high24h: row.high_24h,
      low24h: row.low_24h,
      volume24h: row.volume_24h,
      quoteVolume24h: row.volume_24h_usd,
      change24h: row.change_percent_24h,
      changeAmount24h: row.change_24h,
      bestBid: row.best_bid,
      bestAsk: row.best_ask,
      open24h: row.open_24h,
      timestamp: row.ticker_timestamp.toISOString(),
    }));
  }

  async getOhlcv(pairId: string, intervalSec: number, limit: number): Promise<Array<{
    pair_id: string;
    interval_sec: number;
    open_time: Date;
    open: string;
    high: string;
    low: string;
    close: string;
    volume: string;
    quote_volume: string;
    trades_count: number;
  }>> {
    const repository = this.getRepository(ReadMarketOhlcv);
    const rows = await repository.find({
      where: { pair_id: pairId, interval_sec: intervalSec },
      order: { open_time: 'DESC' },
      take: limit,
    });

    return rows.reverse().map((row) => ({
      pair_id: row.pair_id,
      interval_sec: row.interval_sec,
      open_time: row.open_time,
      open: row.open,
      high: row.high,
      low: row.low,
      close: row.close,
      volume: row.volume,
      quote_volume: row.quote_volume,
      trades_count: row.trades_count,
    }));
  }

  async getOhlcvBySymbol(symbol: string, intervalSec: number, limit: number) {
    const pairId = await this.resolvePairIdBySymbol(symbol);
    if (!pairId) return [];
    return this.getOhlcv(pairId, intervalSec, limit);
  }

  private getRepository<TEntity extends object>(entity: { new (): TEntity }): Repository<TEntity> {
    if (!this.marketTsDb) {
      throw new Error('MARKET_TS_DB_UNAVAILABLE');
    }
    return this.marketTsDb.getRepository(entity);
  }
}
