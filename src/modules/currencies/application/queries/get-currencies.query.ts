import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { CacheService } from '@/common/services';
import type { Currency } from '@/entities/currency.entity';
import { MarketsService } from '@/modules/markets/markets.service';
import { CURRENCY_REPOSITORY, type CurrencyRepositoryPort } from '../../domain/ports';

const CACHE_KEY_PREFIX = 'currencies:';
const CACHE_TTL = 3600;

@Injectable()
export class GetCurrenciesQuery {
  private readonly logger = new Logger(GetCurrenciesQuery.name);

  constructor(
    @Inject(CURRENCY_REPOSITORY)
    private readonly currencyRepo: CurrencyRepositoryPort,
    private readonly cacheService: CacheService,
    @Inject(forwardRef(() => MarketsService))
    private readonly marketsService: MarketsService,
  ) {}

  async execute(params: {
    page?: number;
    limit?: number;
    includeInactive?: boolean;
    includeMarketData?: boolean;
    search?: string;
    isTradable?: boolean;
    isActive?: boolean;
  }): Promise<{ currencies: Currency[]; total: number; page: number; limit: number }> {
    const {
      page = 1,
      limit = 10,
      includeInactive = false,
      includeMarketData = false,
      search,
      isTradable,
      isActive,
    } = params;

    const hasExtraFilter =
      (search !== undefined && search.trim() !== '') ||
      isTradable !== undefined ||
      isActive !== undefined;

    if (hasExtraFilter) {
      return this.search(params);
    }

    const cacheKey = `${CACHE_KEY_PREFIX}list:${page}:${limit}:${includeInactive}`;

    const result = await this.cacheService.getOrSet(
      cacheKey,
      async () => this.currencyRepo.findWithPagination(page, limit, { includeInactive }),
      CACHE_TTL,
    );

    const currencies = includeMarketData
      ? await this.mapTickersToCurrencies(result.data)
      : result.data;

    return { currencies, total: result.total, page, limit };
  }

  private async search(params: {
    page: number;
    limit: number;
    includeInactive?: boolean;
    includeMarketData?: boolean;
    search?: string;
    isTradable?: boolean;
    isActive?: boolean;
  }): Promise<{ currencies: Currency[]; total: number; page: number; limit: number }> {
    const {
      page,
      limit,
      includeInactive = false,
      includeMarketData = false,
      search,
      isTradable,
      isActive,
    } = params;

    const result = await this.currencyRepo.findWithSearch({
      search,
      isTradable,
      isActive,
      includeInactive,
      page,
      limit,
    });

    const enriched = includeMarketData
      ? await this.mapTickersToCurrencies(result.currencies)
      : result.currencies;

    return { currencies: enriched, total: result.total, page, limit };
  }

  private async mapTickersToCurrencies(currencies: Currency[]): Promise<Currency[]> {
    if (!currencies || currencies.length === 0) return currencies;
    try {
      const baseSymbols = Array.from(
        new Set(
          currencies
            .map((c) => c.symbol?.trim().toUpperCase())
            .filter((s): s is string => Boolean(s)),
        ),
      );
      const tickers = await this.marketsService.getTickersForBaseSymbols(baseSymbols);
      const tickerByBase = new Map<string, (typeof tickers)[number]>();
      for (const ticker of tickers) {
        const base = ticker.symbol?.toUpperCase().split('/')[0];
        if (base && !tickerByBase.has(base)) tickerByBase.set(base, ticker);
      }
      return currencies.map((currency) => {
        const bestTicker = tickerByBase.get(currency.symbol.toUpperCase());
        if (bestTicker) {
          currency.lastPrice = bestTicker.lastPrice;
          currency.priceChangePercent24h = bestTicker.change24h;
          currency.volume24h = bestTicker.volume24h;
        }
        return currency;
      });
    } catch (err) {
      this.logger.warn(`Failed to map tickers to currencies: ${(err as Error).message}`);
      return currencies;
    }
  }

  async getActive(): Promise<Currency[]> {
    const cacheKey = `${CACHE_KEY_PREFIX}active`;
    return this.cacheService.getOrSet(
      cacheKey,
      async () => this.currencyRepo.findActive(),
      CACHE_TTL,
    );
  }

  async getTradable(): Promise<Currency[]> {
    const cacheKey = `${CACHE_KEY_PREFIX}tradable`;
    return this.cacheService.getOrSet(
      cacheKey,
      async () => this.currencyRepo.findTradable(),
      CACHE_TTL,
    );
  }
}
