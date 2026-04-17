import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReadMarketPair } from '@/entities/read-market-pair.entity';
import type { MarketPairRecord } from '@/modules/markets';
import type { MarketTickerDto } from '../../dto';
import { MarketsService } from '../../markets.service';

/**
 * GetMarketPairQuery - read-only query for market pair data.
 * Delegates to MarketsService; use this from controllers instead of calling the service directly.
 */
@Injectable()
export class GetMarketPairQuery {
  constructor(
    private readonly marketsService: MarketsService,
    private readonly config: ConfigService,
    @InjectRepository(ReadMarketPair)
    private readonly readMarketPairRepo: Repository<ReadMarketPair>,
  ) {}

  private readProjectionEnabled(): boolean {
    const v = (this.config.get<string>('READ_MARKETS_FROM_PROJECTION') ?? '').trim().toLowerCase();
    return v === 'true' || v === '1' || v === 'yes';
  }

  async findAll(params: {
    page?: number;
    limit?: number;
    includeInactive?: boolean;
    includeTickers?: boolean;
    search?: string | null;
    baseSymbol?: string | null;
    quoteSymbol?: string | null;
    quoteSymbols?: string | null;
    sortBy?: string | null;
    sortOrder?: string | null;
    fuzzySearch?: boolean;
  }): Promise<{
    pairs: MarketPairRecord[];
    total: number;
    page: number;
    limit: number;
    tickers?: MarketTickerDto[];
  }> {
    const page = params.page ?? 1;
    const limit = params.limit ?? 10;
    const includeTickers = params.includeTickers ?? false;

    if (
      this.readProjectionEnabled() &&
      !includeTickers &&
      !(params.search ?? '').trim() &&
      !(params.baseSymbol ?? '').trim() &&
      !(params.quoteSymbol ?? '').trim() &&
      !(params.quoteSymbols ?? '').trim() &&
      !(params.sortBy ?? '').trim()
    ) {
      const qb = this.readMarketPairRepo.createQueryBuilder('m');
      if (!params.includeInactive) {
        qb.andWhere('m.is_active = :active', { active: true });
      }
      qb.orderBy('m.symbol', (params.sortOrder ?? 'asc').toLowerCase() === 'desc' ? 'DESC' : 'ASC');
      const total = await qb.getCount();
      qb.skip((page - 1) * limit).take(limit);
      const rows = await qb.getMany();
      const pairs: MarketPairRecord[] = rows.map((r) => ({
        pair_id: r.pair_id,
        symbol: r.symbol,
        base_currency_id: r.base_currency_id,
        quote_currency_id: r.quote_currency_id,
        status: r.is_active ? 'ACTIVE' : 'INACTIVE',
        amount_scale: 6,
        price_scale: 2,
        min_order_amount: '0.0001',
        maker_fee_rate: '0.001',
        taker_fee_rate: '0.001',
        is_active: r.is_active,
        created_at: r.updated_at,
        updated_at: r.updated_at,
      }));
      return { pairs, total, page, limit };
    }

    return this.marketsService.findAll(
      page,
      limit,
      params.includeInactive ?? false,
      params.includeTickers ?? false,
      params.search ?? null,
      params.baseSymbol ?? null,
      params.quoteSymbol ?? null,
      params.quoteSymbols ?? null,
      params.sortBy ?? null,
      params.sortOrder ?? null,
      params.fuzzySearch ?? false,
    );
  }

  async findOne(pairId: string): Promise<MarketPairRecord> {
    return this.marketsService.findOne(pairId);
  }

  async findBySymbol(symbol: string): Promise<MarketPairRecord> {
    return this.marketsService.findBySymbol(symbol);
  }

  async findActive(): Promise<MarketPairRecord[]> {
    return this.marketsService.findActive();
  }
}
