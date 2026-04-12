import {
  forwardRef,
  Inject,
  Injectable,
  Logger,
  type OnModuleInit,
  Optional,
} from '@nestjs/common';
import { BadRequestException, ConflictException, NotFoundException } from '@/common/exceptions';
import type { CacheService } from '@/common/services';
import type { MarketPair } from '@/entities/market-pair.entity';
import { CurrenciesService } from '@/modules/currencies/currencies.service';
import {
  type DepthSnapshot,
  OrderBookService,
} from '@/modules/matching/orderbook/order-book.service';
import type { OHLCVProviderRegistry } from '@/modules/price-oracle';
import type { CreateMarketPairDto, MarketTickerDto, UpdateMarketPairDto } from './dto';
import type { IMarketTickerData } from './interfaces/market-ticker.interface';
import type { MarketRepository } from './repositories';

/** Default string for missing/zero price (repository contract). */
const TICKER_ZERO = '0';
/** Decimal places for change percentage (e.g. "0.52"). */
const CHANGE_PERCENT_DECIMALS = 2;
/** Decimal places for price/amount strings (e.g. changeAmount24h). */
const PRICE_AMOUNT_DECIMALS = 18;

type MarketsSortBy = 'symbol' | 'base' | 'quote' | 'createdAt';
type MarketsSortOrder = 'asc' | 'desc';

/**
 * Markets Service - Business Logic Layer
 * Service Layer Pattern: Business logic tập trung
 * Single Responsibility Principle: Chỉ xử lý market business logic
 * Dependency Inversion: Phụ thuộc vào Repository abstraction
 * Cache-Aside: Ticker/orderbook cached with short TTL
 */
@Injectable()
export class MarketsService implements OnModuleInit {
  private readonly logger = new Logger(MarketsService.name);
  private readonly CACHE_KEY_PREFIX = 'markets:';
  private readonly CACHE_TTL = 300; // 5 minutes for market data (shorter than currencies)
  private readonly TICKER_CACHE_TTL = 60; // 1 minute for ticker (real-time data)

  constructor(
    private readonly marketRepository: MarketRepository,
    private readonly cacheService: CacheService,
    @Inject(forwardRef(() => CurrenciesService))
    private readonly currenciesService: CurrenciesService,
    private readonly ohlcvProviderRegistry: OHLCVProviderRegistry,
    @Optional()
    @Inject(forwardRef(() => OrderBookService))
    private readonly orderBookService?: OrderBookService,
  ) {}

  async onModuleInit(): Promise<void> {
    // Skip cache invalidation on startup – cache is empty; avoid calling Redis before it's ready
  }

  /**
   * Find all market pairs with pagination and optional search/filter
   * Cache-Aside Pattern: Check cache first, then database.
   * If cache returned empty pairs[], invalidate and re-fetch once (avoid stale empty after sync).
   */
  async findAll(
    page: number = 1,
    limit: number = 10,
    includeInactive: boolean = false,
    includeTickers: boolean = false,
    search?: string | null,
    baseSymbol?: string | null,
    quoteSymbol?: string | null,
    quoteSymbols?: string | null,
    sortBy?: string | null,
    sortOrder?: string | null,
    fuzzySearch: boolean = false,
  ): Promise<{
    pairs: MarketPair[];
    total: number;
    page: number;
    limit: number;
    tickers?: MarketTickerDto[];
  }> {
    const searchNorm = search?.trim() ?? '';
    const baseNorm = baseSymbol?.trim() ?? '';
    const quoteNorm = quoteSymbol?.trim() ?? '';
    const quoteSymbolsNorm = this.normalizeQuoteSymbols(quoteSymbols);
    const sortByNorm = this.normalizeSortBy(sortBy);
    const sortOrderNorm = this.normalizeSortOrder(sortOrder);
    const cacheKey = `${this.CACHE_KEY_PREFIX}list:${page}:${limit}:${includeInactive}:${searchNorm}:${baseNorm}:${quoteNorm}:${quoteSymbolsNorm.join('|')}:${sortByNorm}:${sortOrderNorm}:${fuzzySearch}`;

    const result = await this.cacheService.getOrSet(
      cacheKey,
      async () => {
        return this.marketRepository.findWithPagination(page, limit, {
          includeInactive,
          search: searchNorm || undefined,
          baseSymbol: baseNorm || undefined,
          quoteSymbol: quoteNorm || undefined,
          quoteSymbols: quoteSymbolsNorm,
          sortBy: sortByNorm,
          sortOrder: sortOrderNorm,
          fuzzySearch,
        });
      },
      this.CACHE_TTL,
    );

    const pairs = result.data ?? [];
    if (Array.isArray(pairs) && pairs.length === 0) {
      await this.cacheService.invalidatePattern(`${this.CACHE_KEY_PREFIX}*`);
      const fresh = await this.marketRepository.findWithPagination(page, limit, {
        includeInactive,
        search: searchNorm || undefined,
        baseSymbol: baseNorm || undefined,
        quoteSymbol: quoteNorm || undefined,
        quoteSymbols: quoteSymbolsNorm,
        sortBy: sortByNorm,
        sortOrder: sortOrderNorm,
        fuzzySearch,
      });
      if (fresh.data.length > 0) {
        await this.cacheService.set(cacheKey, fresh, this.CACHE_TTL);
        const tickers = includeTickers ? await this.getTickersForPairs(fresh.data) : undefined;
        return {
          pairs: fresh.data,
          total: fresh.total,
          page: fresh.page,
          limit: fresh.limit,
          ...(tickers != null && { tickers }),
        };
      }
    }

    const tickers =
      includeTickers && pairs.length > 0 ? await this.getTickersForPairs(pairs) : undefined;
    return {
      pairs,
      total: result.total,
      page: result.page,
      limit: result.limit,
      ...(tickers != null && { tickers }),
    };
  }

  private normalizeQuoteSymbols(raw?: string | null): string[] {
    if (!raw) return [];
    return Array.from(
      new Set(
        raw
          .split(',')
          .map((item) => item.trim().toUpperCase())
          .filter((item) => item.length > 0),
      ),
    );
  }

  private normalizeSortBy(raw?: string | null): MarketsSortBy {
    const value = (raw ?? '').trim();
    if (value === 'base' || value === 'quote' || value === 'createdAt') return value;
    return 'symbol';
  }

  private normalizeSortOrder(raw?: string | null): MarketsSortOrder {
    const value = (raw ?? '').trim().toLowerCase();
    if (value === 'desc') return 'desc';
    return 'asc';
  }

  /**
   * Find market pair by ID
   * Cache-Aside Pattern: Cache individual pair
   */
  async findOne(pairId: string): Promise<MarketPair> {
    const cacheKey = `${this.CACHE_KEY_PREFIX}id:${pairId}`;

    const pair = await this.cacheService.getOrSet(
      cacheKey,
      async () => {
        const found = await this.marketRepository.findOne({
          where: { pair_id: pairId } as any,
          relations: ['base_currency', 'quote_currency'],
        });
        if (!found) {
          throw new NotFoundException('MarketPair', pairId);
        }
        return found;
      },
      this.CACHE_TTL,
    );

    return pair;
  }

  /**
   * Find market pair by symbol
   * Cache-Aside Pattern: Cache by symbol
   */
  async findBySymbol(symbol: string): Promise<MarketPair> {
    const cacheKey = `${this.CACHE_KEY_PREFIX}symbol:${symbol.toUpperCase()}`;

    const pair = await this.cacheService.getOrSet(
      cacheKey,
      async () => {
        const found = await this.marketRepository.findBySymbol(symbol);
        if (!found) {
          throw new NotFoundException('MarketPair', symbol);
        }
        return found;
      },
      this.CACHE_TTL,
    );

    return pair;
  }

  /**
   * Get all active market pairs
   * Cache-Aside Pattern: Cache active list.
   * If cache returned empty [], invalidate and re-fetch once (avoid stale empty after sync).
   */
  async findActive(): Promise<MarketPair[]> {
    const cacheKey = `${this.CACHE_KEY_PREFIX}active`;

    const cached = await this.cacheService.getOrSet(
      cacheKey,
      async () => {
        return this.marketRepository.findActive();
      },
      this.CACHE_TTL,
    );

    if (Array.isArray(cached) && cached.length === 0) {
      await this.cacheService.invalidatePattern(`${this.CACHE_KEY_PREFIX}*`);
      const fresh = await this.marketRepository.findActive();
      if (fresh.length > 0) {
        await this.cacheService.set(cacheKey, fresh, this.CACHE_TTL);
        return fresh;
      }
    }
    return cached;
  }

  /**
   * Create new market pair
   * Business Logic: Validate currencies, generate symbol, check conflicts
   */
  async create(createMarketPairDto: CreateMarketPairDto): Promise<MarketPair> {
    // Validate base currency exists and is tradable
    const baseCurrency = await this.currenciesService.findOne(
      String(createMarketPairDto.baseCurrencyId),
    );
    if (!baseCurrency.is_tradable || !baseCurrency.is_active) {
      throw new BadRequestException(
        `Base currency ${baseCurrency.symbol} is not tradable or active`,
      );
    }

    // Validate quote currency exists and is tradable
    const quoteCurrency = await this.currenciesService.findOne(
      String(createMarketPairDto.quoteCurrencyId),
    );
    if (!quoteCurrency.is_tradable || !quoteCurrency.is_active) {
      throw new BadRequestException(
        `Quote currency ${quoteCurrency.symbol} is not tradable or active`,
      );
    }

    // Check if base and quote are the same
    if (createMarketPairDto.baseCurrencyId === createMarketPairDto.quoteCurrencyId) {
      throw new BadRequestException('Base and quote currencies cannot be the same');
    }

    // Check if pair already exists
    const pairExists = await this.marketRepository.pairExists(
      String(createMarketPairDto.baseCurrencyId),
      String(createMarketPairDto.quoteCurrencyId),
    );
    if (pairExists) {
      throw new ConflictException(
        `Market pair ${baseCurrency.symbol}/${quoteCurrency.symbol} already exists`,
        'MARKET_PAIR_EXISTS',
      );
    }

    // Generate symbol if not provided
    const symbol = createMarketPairDto.symbol || `${baseCurrency.symbol}/${quoteCurrency.symbol}`;

    // Check if symbol already exists
    const symbolExists = await this.marketRepository.symbolExists(symbol);
    if (symbolExists) {
      throw new ConflictException(
        `Market pair symbol ${symbol} already exists`,
        'MARKET_PAIR_SYMBOL_EXISTS',
      );
    }

    // Create market pair
    const pair = await this.marketRepository.create({
      base_currency_id: String(createMarketPairDto.baseCurrencyId),
      quote_currency_id: String(createMarketPairDto.quoteCurrencyId),
      symbol: symbol.toUpperCase(),
      price_scale: createMarketPairDto.priceScale ?? 2,
      amount_scale: createMarketPairDto.amountScale ?? 6,
      min_order_amount: createMarketPairDto.minOrderAmount ?? '0.0001',
      maker_fee_rate: (createMarketPairDto.makerFeeRate ?? 0.001).toString(),
      taker_fee_rate: (createMarketPairDto.takerFeeRate ?? 0.001).toString(),
      is_active: createMarketPairDto.isActive ?? true,
    });

    // Invalidate cache
    await this.invalidateCache();

    this.logger.log(`Market pair created: ${pair.symbol} (ID: ${pair.pair_id})`);

    return pair;
  }

  /**
   * Update market pair
   * Business Logic: Validate updates, check conflicts
   */
  async update(pairId: string, updateMarketPairDto: UpdateMarketPairDto): Promise<MarketPair> {
    // Verify pair exists
    const pair = await this.findOne(pairId);

    // Validate base currency if being updated
    if (updateMarketPairDto.baseCurrencyId) {
      const baseCurrency = await this.currenciesService.findOne(
        String(updateMarketPairDto.baseCurrencyId),
      );
      if (!baseCurrency.is_tradable || !baseCurrency.is_active) {
        throw new BadRequestException(
          `Base currency ${baseCurrency.symbol} is not tradable or active`,
        );
      }
    }

    // Validate quote currency if being updated
    if (updateMarketPairDto.quoteCurrencyId) {
      const quoteCurrency = await this.currenciesService.findOne(
        String(updateMarketPairDto.quoteCurrencyId),
      );
      if (!quoteCurrency.is_tradable || !quoteCurrency.is_active) {
        throw new BadRequestException(
          `Quote currency ${quoteCurrency.symbol} is not tradable or active`,
        );
      }
    }

    // Check if new pair combination conflicts
    const newBaseId =
      updateMarketPairDto.baseCurrencyId != null
        ? String(updateMarketPairDto.baseCurrencyId)
        : pair.base_currency_id;
    const newQuoteId =
      updateMarketPairDto.quoteCurrencyId != null
        ? String(updateMarketPairDto.quoteCurrencyId)
        : pair.quote_currency_id;

    if (newBaseId === newQuoteId) {
      throw new BadRequestException('Base and quote currencies cannot be the same');
    }

    if (newBaseId !== pair.base_currency_id || newQuoteId !== pair.quote_currency_id) {
      const pairExists = await this.marketRepository.pairExists(newBaseId, newQuoteId, pairId);
      if (pairExists) {
        throw new ConflictException(
          'Market pair with these currencies already exists',
          'MARKET_PAIR_EXISTS',
        );
      }
    }

    // Check if new symbol conflicts
    if (updateMarketPairDto.symbol && updateMarketPairDto.symbol !== pair.symbol) {
      const symbolExists = await this.marketRepository.symbolExists(
        updateMarketPairDto.symbol,
        pairId,
      );
      if (symbolExists) {
        throw new ConflictException(
          `Market pair symbol ${updateMarketPairDto.symbol} already exists`,
          'MARKET_PAIR_SYMBOL_EXISTS',
        );
      }
    }

    // Update pair
    const updateData: Partial<MarketPair> = {};
    if (updateMarketPairDto.baseCurrencyId !== undefined)
      updateData.base_currency_id = String(updateMarketPairDto.baseCurrencyId);
    if (updateMarketPairDto.quoteCurrencyId !== undefined)
      updateData.quote_currency_id = String(updateMarketPairDto.quoteCurrencyId);
    if (updateMarketPairDto.symbol !== undefined) updateData.symbol = updateMarketPairDto.symbol;
    if (updateMarketPairDto.priceScale !== undefined)
      updateData.price_scale = updateMarketPairDto.priceScale;
    if (updateMarketPairDto.amountScale !== undefined)
      updateData.amount_scale = updateMarketPairDto.amountScale;
    if (updateMarketPairDto.minOrderAmount !== undefined)
      updateData.min_order_amount = updateMarketPairDto.minOrderAmount;
    if (updateMarketPairDto.makerFeeRate !== undefined)
      updateData.maker_fee_rate = updateMarketPairDto.makerFeeRate.toString();
    if (updateMarketPairDto.takerFeeRate !== undefined)
      updateData.taker_fee_rate = updateMarketPairDto.takerFeeRate.toString();
    if (updateMarketPairDto.isActive !== undefined)
      updateData.is_active = updateMarketPairDto.isActive;

    const updated = await this.marketRepository.update(pairId, updateData);

    // Invalidate cache
    await this.invalidateCache();

    this.logger.log(`Market pair updated: ${updated.symbol} (ID: ${pairId})`);

    return updated;
  }

  /**
   * Delete market pair (soft delete - set is_active to false)
   */
  async remove(pairId: string): Promise<void> {
    // Verify pair exists
    await this.findOne(pairId);

    // Soft delete by setting is_active to false
    await this.marketRepository.update(pairId, { is_active: false } as any);

    // Invalidate cache
    await this.invalidateCache();

    this.logger.log(`Market pair deleted (soft): ${pairId}`);
  }

  /**
   * Get market ticker (24h statistics).
   * Cache-Aside Pattern: Cache ticker with shorter TTL.
   * Returns typed DTO for API response.
   */
  async getTicker(pairId: string): Promise<MarketTickerDto> {
    const cacheKey = `${this.CACHE_KEY_PREFIX}ticker:${pairId}`;

    return this.cacheService.getOrSet(
      cacheKey,
      async () => {
        const pair = await this.findOne(pairId);
        let tickerData = await this.marketRepository.getTicker(pairId);
        tickerData = await this.applyOHLCVFallbackIfNeeded(pairId, pair.symbol, tickerData);
        return this.buildTickerResponse(pair, tickerData);
      },
      this.TICKER_CACHE_TTL,
    );
  }

  /**
   * When lastPrice is missing or zero, build ticker from Oracle OHLCV (on-demand 24h range).
   * Single Responsibility: centralizes OHLCV fallback via Price Oracle (no DB).
   */
  private async applyOHLCVFallbackIfNeeded(
    pairId: string,
    symbol: string,
    tickerData: IMarketTickerData,
  ): Promise<IMarketTickerData> {
    if (tickerData?.lastPrice && this.parsePrice(tickerData.lastPrice) > 0) {
      return tickerData;
    }
    const toDate = new Date();
    const fromDate = new Date(toDate.getTime() - 25 * 60 * 60 * 1000);
    const candles = await this.ohlcvProviderRegistry.getOHLCVByRange(
      pairId,
      symbol,
      60,
      fromDate,
      toDate,
      1500,
    );
    if (candles.length === 0) return tickerData;
    const sorted = [...candles].sort(
      (a, b) => new Date(a.open_time).getTime() - new Date(b.open_time).getTime(),
    );
    const lastCandle = sorted[sorted.length - 1];
    const fallbackPrice = lastCandle.close;
    if (!fallbackPrice || this.parsePrice(fallbackPrice) <= 0) return tickerData;

    const nowMs = toDate.getTime();
    const cutoff24h = nowMs - 23 * 60 * 60 * 1000;
    let open24hOhlcv = '';
    for (let i = sorted.length - 1; i >= 0; i--) {
      const t = new Date(sorted[i].open_time).getTime();
      if (t <= cutoff24h) {
        open24hOhlcv = sorted[i].close;
        break;
      }
    }
    const volume24hOhlcv = sorted
      .filter((c) => new Date(c.open_time).getTime() >= nowMs - 24 * 60 * 60 * 1000)
      .reduce((sum, c) => sum + this.parsePrice(c.volume), 0);
    const earliestClose = sorted[0]?.close ?? '';

    const last = this.parsePrice(fallbackPrice);
    const open24hValue = this.resolveOpen24h(open24hOhlcv, earliestClose, last);
    const changeAmount = last - open24hValue;
    const changePercent =
      open24hValue > 0
        ? ((changeAmount / open24hValue) * 100).toFixed(CHANGE_PERCENT_DECIMALS)
        : TICKER_ZERO;
    const useFallback = (v: string) => (v === TICKER_ZERO ? fallbackPrice : v);
    return {
      ...tickerData,
      lastPrice: fallbackPrice,
      open24h: String(open24hValue),
      high24h: useFallback(tickerData.high24h),
      low24h: useFallback(tickerData.low24h),
      bestBid: useFallback(tickerData.bestBid),
      bestAsk: useFallback(tickerData.bestAsk),
      change24h: changePercent,
      changeAmount24h: changeAmount.toFixed(PRICE_AMOUNT_DECIMALS),
      volume24h: volume24hOhlcv >= 0 ? String(volume24hOhlcv) : tickerData.volume24h,
      quoteVolume24h:
        tickerData.quoteVolume24h === TICKER_ZERO
          ? (volume24hOhlcv * last).toFixed(PRICE_AMOUNT_DECIMALS)
          : tickerData.quoteVolume24h,
    };
  }

  private parsePrice(value: string): number {
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : 0;
  }

  /** Prefer 24h-ago close; if none (e.g. under 24h data), use earliest close; else current (0% change). */
  private resolveOpen24h(open24hOhlcv: string, earliestClose: string, last: number): number {
    if (open24hOhlcv && this.parsePrice(open24hOhlcv) > 0) return this.parsePrice(open24hOhlcv);
    if (earliestClose && this.parsePrice(earliestClose) > 0) return this.parsePrice(earliestClose);
    return last;
  }

  private buildTickerResponse(pair: MarketPair, tickerData: IMarketTickerData): MarketTickerDto {
    return {
      symbol: pair.symbol,
      pairId: pair.pair_id,
      ...tickerData,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Get ticker by symbol
   */
  async getTickerBySymbol(symbol: string): Promise<MarketTickerDto> {
    const pair = await this.findBySymbol(symbol);
    return this.getTicker(pair.pair_id);
  }

  /** Max concurrent OHLCV fallback requests to avoid timeout when enriching list tickers. */
  private static readonly TICKER_FALLBACK_CONCURRENCY = 5;

  /**
   * Get ticker data for given pairs. Uses DB first; for pairs with no/zero price,
   * applies OHLCV fallback (Price Oracle) in batches to match single-ticker API behaviour.
   */
  private async getTickersForPairs(pairs: MarketPair[]): Promise<MarketTickerDto[]> {
    if (pairs.length === 0) return [];
    const tickerDataList = await Promise.all(
      pairs.map((pair) => this.marketRepository.getTicker(pair.pair_id)),
    );
    const finalTickerData: IMarketTickerData[] = pairs.map(
      (_, i) => tickerDataList[i] ?? this.emptyTickerData(),
    );
    const needFallback: { pair: MarketPair; data: IMarketTickerData; index: number }[] = [];
    finalTickerData.forEach((data, i) => {
      if (!data?.lastPrice || this.parsePrice(data.lastPrice) <= 0) {
        needFallback.push({ pair: pairs[i], data, index: i });
      }
    });
    for (let b = 0; b < needFallback.length; b += MarketsService.TICKER_FALLBACK_CONCURRENCY) {
      const batch = needFallback.slice(b, b + MarketsService.TICKER_FALLBACK_CONCURRENCY);
      const results = await Promise.all(
        batch.map(({ pair, data }) =>
          this.applyOHLCVFallbackIfNeeded(pair.pair_id, pair.symbol, data),
        ),
      );
      batch.forEach((item, j) => {
        finalTickerData[item.index] = results[j];
      });
    }
    return pairs.map((pair, i) =>
      this.buildTickerResponse(pair, finalTickerData[i] ?? this.emptyTickerData()),
    );
  }

  private emptyTickerData(): IMarketTickerData {
    return {
      lastPrice: TICKER_ZERO,
      open24h: TICKER_ZERO,
      high24h: TICKER_ZERO,
      low24h: TICKER_ZERO,
      volume24h: TICKER_ZERO,
      quoteVolume24h: TICKER_ZERO,
      change24h: TICKER_ZERO,
      changeAmount24h: TICKER_ZERO,
      bestBid: TICKER_ZERO,
      bestAsk: TICKER_ZERO,
    };
  }

  /**
   * Get all tickers for active pairs.
   * Uses batch DB read (no OHLCV fallback) to avoid timeout when many pairs.
   */
  async getAllTickers(): Promise<MarketTickerDto[]> {
    const cacheKey = `${this.CACHE_KEY_PREFIX}tickers:all`;

    return this.cacheService.getOrSet(
      cacheKey,
      async () => {
        const activePairs = await this.findActive();
        return this.getTickersForPairs(activePairs);
      },
      this.TICKER_CACHE_TTL,
    );
  }

  /**
   * Get representative tickers for a set of base symbols.
   * This avoids scanning ticker data for all active pairs when only a small page of currencies is needed.
   */
  async getTickersForBaseSymbols(baseSymbols: string[]): Promise<MarketTickerDto[]> {
    if (baseSymbols.length === 0) return [];

    const normalizedSymbols = new Set(
      baseSymbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean),
    );
    if (normalizedSymbols.size === 0) return [];

    const activePairs = await this.findActive();
    const selectedByBase = new Map<string, MarketPair>();

    for (const pair of activePairs) {
      const base = this.extractBaseSymbol(pair.symbol);
      if (!base || !normalizedSymbols.has(base)) {
        continue;
      }

      const current = selectedByBase.get(base);
      if (!current) {
        selectedByBase.set(base, pair);
        continue;
      }

      const currentPriority = this.quotePriority(current.symbol);
      const nextPriority = this.quotePriority(pair.symbol);
      if (nextPriority < currentPriority) {
        selectedByBase.set(base, pair);
      }
    }

    if (selectedByBase.size === 0) return [];
    return this.getTickersForPairs(Array.from(selectedByBase.values()));
  }

  private extractBaseSymbol(pairSymbol?: string): string {
    if (!pairSymbol) return '';
    const [base] = pairSymbol.toUpperCase().split('/');
    return base?.trim() ?? '';
  }

  private quotePriority(pairSymbol?: string): number {
    if (!pairSymbol) return Number.MAX_SAFE_INTEGER;
    const upper = pairSymbol.toUpperCase();
    if (upper.endsWith('/USDT')) return 0;
    if (upper.endsWith('/USDC')) return 1;
    if (upper.endsWith('/FDUSD')) return 2;
    if (upper.endsWith('/BUSD')) return 3;
    if (upper.endsWith('/TRY')) return 4;
    return 10;
  }

  /**
   * Get order book for a market pair
   * Cache-Aside Pattern: Cache order book with short TTL
   */
  async getOrderBook(pairId: string, limit: number = 20): Promise<any> {
    const cacheKey = `${this.CACHE_KEY_PREFIX}orderbook:${pairId}:${limit}`;

    return this.cacheService.getOrSet(
      cacheKey,
      async () => {
        const pair = await this.findOne(pairId);
        const orderBook = await this.marketRepository.getOrderBook(pairId, limit);

        return {
          symbol: pair.symbol,
          pairId: pair.pair_id,
          bids: orderBook.bids,
          asks: orderBook.asks,
          bidLevels: orderBook.bids.length,
          askLevels: orderBook.asks.length,
          timestamp: new Date().toISOString(),
        };
      },
      10, // Very short TTL for order book (10 seconds) - real-time data
    );
  }

  /**
   * Get order book by symbol
   */
  async getOrderBookBySymbol(symbol: string, limit: number = 20): Promise<any> {
    const pair = await this.findBySymbol(symbol);
    return this.getOrderBook(pair.pair_id, limit);
  }

  /**
   * Get recent trades for a market pair
   */
  async getRecentTrades(pairId: string, limit: number = 50): Promise<any[]> {
    const cacheKey = `${this.CACHE_KEY_PREFIX}trades:${pairId}:${limit}`;

    return this.cacheService.getOrSet(
      cacheKey,
      async () => {
        const trades = await this.marketRepository.getRecentTrades(pairId, limit);

        return trades.map((trade) => ({
          trade_id: trade.trade_id,
          pair_id: trade.pair_id,
          price: trade.price?.toString() || '0',
          amount: trade.amount?.toString() || '0',
          side: (trade as any).taker_order?.side || 'BUY',
          created_at: trade.created_at,
        }));
      },
      5, // Very short TTL (5 seconds) - real-time data
    );
  }

  /**
   * Get recent trades by symbol
   */
  async getRecentTradesBySymbol(symbol: string, limit: number = 50): Promise<any[]> {
    const pair = await this.findBySymbol(symbol);
    return this.getRecentTrades(pair.pair_id, limit);
  }

  /** Chart range filter: 1d, 1M, 3M, 1y, 5y → fromDate = now - range */
  private static readonly RANGE_MS: Record<string, number> = {
    '1d': 24 * 60 * 60 * 1000,
    '1M': 30 * 24 * 60 * 60 * 1000,
    '3M': 90 * 24 * 60 * 60 * 1000,
    '1y': 365 * 24 * 60 * 60 * 1000,
    '5y': 5 * 365 * 24 * 60 * 60 * 1000,
  };

  /** Range → interval policy (single source for OHLCV endpoint). */
  private static readonly RANGE_INTERVAL: Record<string, string> = {
    '1d': '1m',
    '1M': '1h',
    '3M': '4h',
    '1y': '1d',
    '5y': '1d',
  };

  /**
   * Get OHLCV data for a market pair (on-demand from Price Oracle; no DB).
   * @param range Optional: 1d | 1M | 3M | 1y | 5y — filter candles to this time range
   */
  async getOHLCV(pairId: string, limit: number = 100, range?: string, locale: string = 'en') {
    const pair = await this.findOne(pairId);
    const interval = this.resolveIntervalByRange(range);
    const intervalSec = this.resolveIntervalSeconds(interval);
    const rangeMs = range ? MarketsService.RANGE_MS[range] : 7 * 24 * 60 * 60 * 1000;
    const fromDate = new Date(Date.now() - rangeMs);
    const toDate = new Date();
    const symbol =
      String(pair.symbol)
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '') || pair.symbol;

    const candles = await this.ohlcvProviderRegistry.getOHLCVByRange(
      pairId,
      symbol,
      intervalSec,
      fromDate,
      toDate,
      Math.min(limit, 500),
    );

    return {
      pair_id: pairId,
      interval,
      interval_sec: intervalSec,
      range: range ?? null,
      locale,
      candles: candles.map((c) => ({
        pair_id: c.pair_id,
        interval_sec: c.interval_sec,
        open_time: c.open_time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
      })),
    };
  }

  private resolveIntervalByRange(range?: string): string {
    if (!range) {
      return '1h';
    }

    const interval = MarketsService.RANGE_INTERVAL[range];
    if (!interval) {
      throw new BadRequestException(
        `Invalid range. Supported: ${Object.keys(MarketsService.RANGE_INTERVAL).join(', ')}`,
      );
    }

    return interval;
  }

  /**
   * Transparent Price Discovery: real-time depth snapshot from in-memory matching engine.
   * Depth levels: 5, 10, or 20 price levels per side.
   * No cache — reads directly from the live order book for sub-second freshness.
   */
  async getDepthSnapshot(pairId: string, depth: number): Promise<DepthSnapshot> {
    if (![5, 10, 20].includes(depth)) {
      throw new BadRequestException('Depth limit must be 5, 10, or 20');
    }
    // Validate pair exists
    await this.findOne(pairId);
    if (!this.orderBookService) {
      throw new BadRequestException('Order book service not available');
    }
    return this.orderBookService.getSnapshot(pairId, depth as 5 | 10 | 20);
  }

  /**
   * Get depth snapshot by symbol
   */
  async getDepthSnapshotBySymbol(symbol: string, depth: number): Promise<DepthSnapshot> {
    const pair = await this.findBySymbol(symbol);
    return this.getDepthSnapshot(pair.pair_id, depth);
  }

  /**
   * Invalidate all market-related cache
   * Cache Invalidation Pattern: Clear cache when data changes
   */
  private async invalidateCache(): Promise<void> {
    try {
      await this.cacheService.invalidatePattern(`${this.CACHE_KEY_PREFIX}*`);
      this.logger.debug('Market cache invalidated');
    } catch (error) {
      this.logger.error('Error invalidating market cache', error);
      // Don't throw - cache invalidation failure shouldn't break the operation
    }
  }

  private resolveIntervalSeconds(interval: string): number {
    const normalized = interval?.toLowerCase?.() || '';
    const map: Record<string, number> = {
      '1m': 60,
      '3m': 180,
      '5m': 300,
      '15m': 900,
      '30m': 1800,
      '1h': 3600,
      '2h': 7200,
      '4h': 14400,
      '6h': 21600,
      '12h': 43200,
      '1d': 86400,
      '1w': 604800,
    };

    const seconds = map[normalized];
    if (!seconds) {
      throw new BadRequestException(`Invalid interval. Supported: ${Object.keys(map).join(', ')}`);
    }

    return seconds;
  }
}
