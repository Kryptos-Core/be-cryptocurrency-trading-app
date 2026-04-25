import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { ConflictException, NotFoundException } from '@/common/exceptions';
import { CacheService } from '@/common/services';
import type { Currency } from '@/entities/currency.entity';
import { MarketsService } from '@/modules/markets/markets.service';
import { CURRENCY_REPOSITORY, type CurrencyRepositoryPort } from './domain/ports';
import type { CreateCurrencyDto, UpdateCurrencyDto } from './dto';

/**
 * Currencies Service - Business Logic Layer
 * Service Layer Pattern: Business logic tập trung
 * Single Responsibility Principle: Chỉ xử lý currency business logic
 * Dependency Inversion: Phụ thuộc vào Repository abstraction
 */
@Injectable()
export class CurrenciesService {
  private readonly logger = new Logger(CurrenciesService.name);
  private readonly CACHE_KEY_PREFIX = 'currencies:';
  private readonly CACHE_TTL = 3600; // 1 hour

  constructor(
    @Inject(CURRENCY_REPOSITORY)
    private readonly currencyRepository: CurrencyRepositoryPort,
    private readonly cacheService: CacheService,
    @Inject(forwardRef(() => MarketsService))
    private readonly marketsService: MarketsService,
  ) {}

  /** Helper method to map Ticker info to currencies */
  private async mapTickersToCurrencies(currencies: Currency[]): Promise<Currency[]> {
    if (!currencies || currencies.length === 0) return currencies;

    try {
      const baseSymbols = Array.from(
        new Set(
          currencies
            .map((currency) => currency.symbol?.trim().toUpperCase())
            .filter((symbol): symbol is string => Boolean(symbol)),
        ),
      );
      const tickers = await this.marketsService.getTickersForBaseSymbols(baseSymbols);
      const tickerByBase = new Map<string, (typeof tickers)[number]>();
      for (const ticker of tickers) {
        const base = ticker.symbol?.toUpperCase().split('/')[0];
        if (base && !tickerByBase.has(base)) {
          tickerByBase.set(base, ticker);
        }
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
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to map Ticker Data to Currencies: ${message}`);
      return currencies; // return without tickers gracefully
    }
  }

  /**
   * Find all currencies with pagination.
   * Cache-Aside Pattern: Check cache first, then database.
   *
   * When the caller passes `search`, `isTradable`, or `isActive` the request
   * is forwarded to `searchCurrencies()` which uses a QueryBuilder and skips
   * the Redis cache (results are too query-specific to be worth caching).
   */
  async findAll(
    page: number = 1,
    limit: number = 10,
    includeInactive: boolean = false,
    includeMarketData: boolean = false,
    search?: string,
    isTradable?: boolean,
    isActive?: boolean,
  ): Promise<{ currencies: Currency[]; total: number; page: number; limit: number }> {
    const hasExtraFilter =
      (search !== undefined && search.trim() !== '') ||
      isTradable !== undefined ||
      isActive !== undefined;

    if (hasExtraFilter) {
      return this.searchCurrencies({
        search,
        isTradable,
        isActive,
        includeInactive,
        includeMarketData,
        page,
        limit,
      });
    }

    const cacheKey = `${this.CACHE_KEY_PREFIX}list:${page}:${limit}:${includeInactive}`;

    const result = await this.cacheService.getOrSet(
      cacheKey,
      async () => {
        return this.currencyRepository.findWithPagination(page, limit, {
          includeInactive,
        });
      },
      this.CACHE_TTL,
    );

    // Enrich market data only when explicitly requested to avoid N+1 ticker pressure.
    const mappedCurrencies = includeMarketData
      ? await this.mapTickersToCurrencies(result.data)
      : result.data;

    return {
      currencies: mappedCurrencies,
      total: result.total,
      page: result.page,
      limit: result.limit,
    };
  }

  /**
   * Search currencies by text + multi-filter (isTradable, isActive).
   *
   * Intentionally bypasses Redis cache so that each unique query always
   * returns fresh results without cache-key explosion.
   * The QueryBuilder path (findWithSearch) is used instead of stored procedures.
   */
  async searchCurrencies(params: {
    search?: string;
    isTradable?: boolean;
    isActive?: boolean;
    includeInactive?: boolean;
    includeMarketData?: boolean;
    page: number;
    limit: number;
  }): Promise<{ currencies: Currency[]; total: number; page: number; limit: number }> {
    const result = await this.currencyRepository.findWithSearch({
      search: params.search,
      isTradable: params.isTradable,
      isActive: params.isActive,
      includeInactive: params.includeInactive ?? false,
      page: params.page,
      limit: params.limit,
    });

    const enriched = params.includeMarketData
      ? await this.mapTickersToCurrencies(result.currencies)
      : result.currencies;

    this.logger.debug(
      `searchCurrencies: q="${params.search ?? ''}" isTradable=${params.isTradable} ` +
        `isActive=${params.isActive} → ${result.total} results`,
    );

    return {
      currencies: enriched,
      total: result.total,
      page: result.page,
      limit: result.limit,
    };
  }

  /**
   * Find currency by ID
   * Cache-Aside Pattern: Cache individual currency
   */
  async findOne(currencyId: string): Promise<Currency> {
    const cacheKey = `${this.CACHE_KEY_PREFIX}id:${currencyId}`;

    const currency = await this.cacheService.getOrSet(
      cacheKey,
      async () => {
        const found = await this.currencyRepository.findById(currencyId);
        if (!found) {
          throw new NotFoundException('Currency', currencyId);
        }
        return found;
      },
      this.CACHE_TTL,
    );

    return currency;
  }

  /**
   * Find currency by symbol
   * Cache-Aside Pattern: Cache by symbol
   */
  async findBySymbol(symbol: string): Promise<Currency> {
    const cacheKey = `${this.CACHE_KEY_PREFIX}symbol:${symbol.toUpperCase()}`;

    const currency = await this.cacheService.getOrSet(
      cacheKey,
      async () => {
        const found = await this.currencyRepository.findBySymbol(symbol);
        if (!found) {
          throw new NotFoundException('Currency', symbol);
        }
        return found;
      },
      this.CACHE_TTL,
    );

    return currency;
  }

  /**
   * Get all active currencies
   * Cache-Aside Pattern: Cache active list.
   * If cache returned empty [], invalidate and re-fetch once (avoid stale empty after sync).
   */
  async findActive(): Promise<Currency[]> {
    const cacheKey = `${this.CACHE_KEY_PREFIX}active`;

    const cached = await this.cacheService.getOrSet(
      cacheKey,
      async () => {
        return this.currencyRepository.findActive();
      },
      this.CACHE_TTL,
    );

    if (Array.isArray(cached) && cached.length === 0) {
      await this.cacheService.invalidatePattern(`${this.CACHE_KEY_PREFIX}*`);
      const fresh = await this.currencyRepository.findActive();
      if (fresh.length > 0) {
        await this.cacheService.set(cacheKey, fresh, this.CACHE_TTL);
        return fresh;
      }
    }
    return cached;
  }

  /**
   * Get all tradable currencies
   * Cache-Aside Pattern: Cache tradable list.
   * If cache returned empty [], invalidate and re-fetch once.
   */
  async findTradable(): Promise<Currency[]> {
    const cacheKey = `${this.CACHE_KEY_PREFIX}tradable`;

    const cached = await this.cacheService.getOrSet(
      cacheKey,
      async () => {
        return this.currencyRepository.findTradable();
      },
      this.CACHE_TTL,
    );

    if (Array.isArray(cached) && cached.length === 0) {
      await this.cacheService.invalidatePattern(`${this.CACHE_KEY_PREFIX}*`);
      const fresh = await this.currencyRepository.findTradable();
      if (fresh.length > 0) {
        await this.cacheService.set(cacheKey, fresh, this.CACHE_TTL);
        return fresh;
      }
    }
    return cached;
  }

  /**
   * Create new currency
   * Invalidate cache after creation
   */
  async create(createCurrencyDto: CreateCurrencyDto): Promise<Currency> {
    // Check if symbol already exists
    const symbolExists = await this.currencyRepository.symbolExists(createCurrencyDto.symbol);

    if (symbolExists) {
      throw new ConflictException(
        `Currency with symbol ${createCurrencyDto.symbol} already exists`,
        'CURRENCY_SYMBOL_EXISTS',
      );
    }

    // Create currency
    const currency = await this.currencyRepository.create({
      symbol: createCurrencyDto.symbol,
      name: createCurrencyDto.name,
      precision_scale: createCurrencyDto.precisionScale ?? 8,
      min_withdraw: createCurrencyDto.minWithdraw ?? '0',
      is_tradable: createCurrencyDto.isTradable ?? true,
      is_active: createCurrencyDto.isActive ?? true,
    });

    // Invalidate cache
    await this.invalidateCache();

    this.logger.log(`Currency created: ${currency.symbol} (ID: ${currency.currency_id})`);

    return currency;
  }

  /**
   * Update currency
   * Invalidate cache after update
   */
  async update(currencyId: string, updateCurrencyDto: UpdateCurrencyDto): Promise<Currency> {
    // Verify currency exists
    const currency = await this.findOne(currencyId);

    // Check if new symbol conflicts (if symbol is being updated)
    if (updateCurrencyDto.symbol && updateCurrencyDto.symbol !== currency.symbol) {
      const symbolExists = await this.currencyRepository.symbolExists(
        updateCurrencyDto.symbol,
        currencyId,
      );

      if (symbolExists) {
        throw new ConflictException(
          `Currency with symbol ${updateCurrencyDto.symbol} already exists`,
          'CURRENCY_SYMBOL_EXISTS',
        );
      }
    }

    // Update currency
    const updateData: Partial<Currency> = {};
    if (updateCurrencyDto.name !== undefined) updateData.name = updateCurrencyDto.name;
    if (updateCurrencyDto.precisionScale !== undefined)
      updateData.precision_scale = updateCurrencyDto.precisionScale;
    if (updateCurrencyDto.minWithdraw !== undefined)
      updateData.min_withdraw = updateCurrencyDto.minWithdraw;
    if (updateCurrencyDto.isTradable !== undefined)
      updateData.is_tradable = updateCurrencyDto.isTradable;
    if (updateCurrencyDto.isActive !== undefined) updateData.is_active = updateCurrencyDto.isActive;
    if (updateCurrencyDto.symbol !== undefined) updateData.symbol = updateCurrencyDto.symbol;

    const updated = await this.currencyRepository.update(currencyId, updateData);

    // Invalidate cache
    await this.invalidateCache();

    this.logger.log(`Currency updated: ${updated.symbol} (ID: ${currencyId})`);

    return updated;
  }

  /**
   * Delete currency (soft delete - set is_active to false)
   * Invalidate cache after deletion
   */
  async remove(currencyId: string): Promise<void> {
    // Verify currency exists
    await this.findOne(currencyId);

    // Soft delete by setting is_active to false
    await this.currencyRepository.update(currencyId, { is_active: false } as Partial<Currency>);

    // Invalidate cache
    await this.invalidateCache();

    this.logger.log(`Currency deleted (soft): ${currencyId}`);
  }

  /**
   * Hard delete currency
   * Use with caution - only if currency has no dependencies
   */
  async hardDelete(currencyId: string): Promise<void> {
    // Verify currency exists
    await this.findOne(currencyId);

    // Check if currency is used in market pairs (business rule)
    // This would require checking MarketPair entity
    // For now, we'll just hard delete

    await this.currencyRepository.delete(currencyId);

    // Invalidate cache
    await this.invalidateCache();

    this.logger.log(`Currency hard deleted: ${currencyId}`);
  }

  /**
   * Invalidate all currency-related cache
   * Cache Invalidation Pattern: Clear cache when data changes
   */
  private async invalidateCache(): Promise<void> {
    try {
      await this.cacheService.invalidatePattern(`${this.CACHE_KEY_PREFIX}*`);
      this.logger.debug('Currency cache invalidated');
    } catch (error) {
      this.logger.error('Error invalidating currency cache', error);
      // Don't throw - cache invalidation failure shouldn't break the operation
    }
  }
}
