import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MarketRepository } from './repositories';
import { CreateMarketPairDto, UpdateMarketPairDto, MarketTickerDto } from './dto';
import { MarketPair } from '@/entities/market-pair.entity';
import { IMarketTickerData } from './interfaces/market-ticker.interface';
import { NotFoundException, ConflictException, BadRequestException } from '@/common/exceptions';
import { CacheService } from '@/common/services';
import { CurrenciesService } from '@/modules/currencies/currencies.service';

/** Default string for missing/zero price (repository contract). */
const TICKER_ZERO = '0';
/** Decimal places for change percentage (e.g. "0.52"). */
const CHANGE_PERCENT_DECIMALS = 2;
/** Decimal places for price/amount strings (e.g. changeAmount24h). */
const PRICE_AMOUNT_DECIMALS = 18;

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
    private readonly currenciesService: CurrenciesService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.invalidateCache();
  }

  /**
   * Find all market pairs with pagination
   * Cache-Aside Pattern: Check cache first, then database
   */
  async findAll(
    page: number = 1,
    limit: number = 10,
    includeInactive: boolean = false,
  ): Promise<{ pairs: MarketPair[]; total: number; page: number; limit: number }> {
    const cacheKey = `${this.CACHE_KEY_PREFIX}list:${page}:${limit}:${includeInactive}`;

    const result = await this.cacheService.getOrSet(
      cacheKey,
      async () => {
        return this.marketRepository.findWithPagination(page, limit, {
          includeInactive,
        });
      },
      this.CACHE_TTL,
    );

    return {
      pairs: result.data,
      total: result.total,
      page: result.page,
      limit: result.limit,
    };
  }

  /**
   * Find market pair by ID
   * Cache-Aside Pattern: Cache individual pair
   */
  async findOne(pairId: number): Promise<MarketPair> {
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
   * Cache-Aside Pattern: Cache active list
   */
  async findActive(): Promise<MarketPair[]> {
    const cacheKey = `${this.CACHE_KEY_PREFIX}active`;

    return this.cacheService.getOrSet(
      cacheKey,
      async () => {
        return this.marketRepository.findActive();
      },
      this.CACHE_TTL,
    );
  }

  /**
   * Create new market pair
   * Business Logic: Validate currencies, generate symbol, check conflicts
   */
  async create(createMarketPairDto: CreateMarketPairDto): Promise<MarketPair> {
    // Validate base currency exists and is tradable
    const baseCurrency = await this.currenciesService.findOne(
      createMarketPairDto.baseCurrencyId,
    );
    if (!baseCurrency.is_tradable || !baseCurrency.is_active) {
      throw new BadRequestException(
        `Base currency ${baseCurrency.symbol} is not tradable or active`,
      );
    }

    // Validate quote currency exists and is tradable
    const quoteCurrency = await this.currenciesService.findOne(
      createMarketPairDto.quoteCurrencyId,
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
      createMarketPairDto.baseCurrencyId,
      createMarketPairDto.quoteCurrencyId,
    );
    if (pairExists) {
      throw new ConflictException(
        `Market pair ${baseCurrency.symbol}/${quoteCurrency.symbol} already exists`,
        'MARKET_PAIR_EXISTS',
      );
    }

    // Generate symbol if not provided
    const symbol =
      createMarketPairDto.symbol ||
      `${baseCurrency.symbol}/${quoteCurrency.symbol}`;

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
      base_currency_id: createMarketPairDto.baseCurrencyId,
      quote_currency_id: createMarketPairDto.quoteCurrencyId,
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
  async update(pairId: number, updateMarketPairDto: UpdateMarketPairDto): Promise<MarketPair> {
    // Verify pair exists
    const pair = await this.findOne(pairId);

    // Validate base currency if being updated
    if (updateMarketPairDto.baseCurrencyId) {
      const baseCurrency = await this.currenciesService.findOne(
        updateMarketPairDto.baseCurrencyId,
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
        updateMarketPairDto.quoteCurrencyId,
      );
      if (!quoteCurrency.is_tradable || !quoteCurrency.is_active) {
        throw new BadRequestException(
          `Quote currency ${quoteCurrency.symbol} is not tradable or active`,
        );
      }
    }

    // Check if new pair combination conflicts
    const newBaseId = updateMarketPairDto.baseCurrencyId || pair.base_currency_id;
    const newQuoteId = updateMarketPairDto.quoteCurrencyId || pair.quote_currency_id;

    if (newBaseId === newQuoteId) {
      throw new BadRequestException('Base and quote currencies cannot be the same');
    }

    if (
      newBaseId !== pair.base_currency_id ||
      newQuoteId !== pair.quote_currency_id
    ) {
      const pairExists = await this.marketRepository.pairExists(
        newBaseId,
        newQuoteId,
        pairId,
      );
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
      updateData.base_currency_id = updateMarketPairDto.baseCurrencyId;
    if (updateMarketPairDto.quoteCurrencyId !== undefined)
      updateData.quote_currency_id = updateMarketPairDto.quoteCurrencyId;
    if (updateMarketPairDto.symbol !== undefined)
      updateData.symbol = updateMarketPairDto.symbol;
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
  async remove(pairId: number): Promise<void> {
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
  async getTicker(pairId: number): Promise<MarketTickerDto> {
    const cacheKey = `${this.CACHE_KEY_PREFIX}ticker:${pairId}`;

    return this.cacheService.getOrSet(
      cacheKey,
      async () => {
        const pair = await this.findOne(pairId);
        let tickerData = await this.marketRepository.getTicker(pairId);
        tickerData = await this.applyOHLCVFallbackIfNeeded(pairId, tickerData);
        return this.buildTickerResponse(pair, tickerData);
      },
      this.TICKER_CACHE_TTL,
    );
  }

  /**
   * When lastPrice is missing or zero, build ticker from OHLCV (latest close, 24h-ago or earliest close, volume).
   * Single Responsibility: centralizes OHLCV fallback logic.
   */
  private async applyOHLCVFallbackIfNeeded(
    pairId: number,
    tickerData: IMarketTickerData,
  ): Promise<IMarketTickerData> {
    if (tickerData?.lastPrice && this.parsePrice(tickerData.lastPrice) > 0) {
      return tickerData;
    }
    const fallbackPrice = await this.marketRepository.getLatestCloseFromOHLCV(pairId);
    if (!fallbackPrice || this.parsePrice(fallbackPrice) <= 0) {
      return tickerData;
    }
    const [open24hOhlcv, volume24hOhlcv, earliestClose] = await Promise.all([
      this.marketRepository.getOHLCVClose24hAgo(pairId),
      this.marketRepository.getOHLCVVolume24h(pairId),
      this.marketRepository.getEarliestCloseFromOHLCV(pairId),
    ]);
    const last = this.parsePrice(fallbackPrice);
    const open24hValue = this.resolveOpen24h(open24hOhlcv, earliestClose, last);
    const changeAmount = last - open24hValue;
    const changePercent =
      open24hValue > 0
        ? ((changeAmount / open24hValue) * 100).toFixed(CHANGE_PERCENT_DECIMALS)
        : TICKER_ZERO;
    const fallbackStr = fallbackPrice;
    const useFallback = (v: string) => (v === TICKER_ZERO ? fallbackStr : v);
    return {
      ...tickerData,
      lastPrice: fallbackStr,
      open24h: String(open24hValue),
      high24h: useFallback(tickerData.high24h),
      low24h: useFallback(tickerData.low24h),
      bestBid: useFallback(tickerData.bestBid),
      bestAsk: useFallback(tickerData.bestAsk),
      change24h: changePercent,
      changeAmount24h: changeAmount.toFixed(PRICE_AMOUNT_DECIMALS),
      volume24h:
        volume24hOhlcv != null && this.parsePrice(volume24hOhlcv) >= 0 ? volume24hOhlcv : tickerData.volume24h,
      quoteVolume24h:
        tickerData.quoteVolume24h === TICKER_ZERO
          ? (this.parsePrice(volume24hOhlcv || TICKER_ZERO) * last).toFixed(PRICE_AMOUNT_DECIMALS)
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

  /**
   * Get all tickers for active pairs
   */
  async getAllTickers(): Promise<MarketTickerDto[]> {
    const cacheKey = `${this.CACHE_KEY_PREFIX}tickers:all`;

    return this.cacheService.getOrSet(
      cacheKey,
      async () => {
        const activePairs = await this.findActive();
        const tickers = await Promise.all(
          activePairs.map((pair) => this.getTicker(pair.pair_id)),
        );
        return tickers;
      },
      this.TICKER_CACHE_TTL,
    );
  }

  /**
   * Get order book for a market pair
   * Cache-Aside Pattern: Cache order book with short TTL
   */
  async getOrderBook(pairId: number, limit: number = 20): Promise<any> {
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
  async getRecentTrades(pairId: number, limit: number = 50): Promise<any[]> {
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

  /**
   * Get OHLCV data for a market pair
   * @param range Optional: 1d | 1M | 3M | 1y | 5y — filter candles to this time range
   */
  async getOHLCV(
    pairId: number,
    interval: string = '1h',
    limit: number = 100,
    range?: string,
  ) {
    await this.findOne(pairId);

    const intervalSec = this.resolveIntervalSeconds(interval);
    const rangeMs = range ? MarketsService.RANGE_MS[range] : null;
    const candles =
      rangeMs != null
        ? await this.marketRepository.getOHLCVByRange(
            pairId,
            intervalSec,
            new Date(Date.now() - rangeMs),
            Math.min(limit, 500),
          )
        : await this.marketRepository.getOHLCV(pairId, intervalSec, limit);

    return {
      pair_id: pairId,
      interval,
      interval_sec: intervalSec,
      range: range ?? null,
      candles,
    };
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
      throw new BadRequestException(
        `Invalid interval. Supported: ${Object.keys(map).join(', ')}`,
      );
    }

    return seconds;
  }
}
