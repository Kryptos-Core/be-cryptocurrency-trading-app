import { Inject, Injectable, Logger } from '@nestjs/common';
import { ServiceUnavailableException } from '@/common/exceptions';
import { CacheService } from '@/common/services';
import { BinanceRestClient } from '@/modules/binance-rest/binance-rest-client.service';
import { GetCurrenciesQuery } from '@/modules/currencies/application/queries/get-currencies.query';
import {
  CURRENCY_REPOSITORY,
  type CurrencyRepositoryPort,
} from '@/modules/currencies/domain/ports';
import { MARKET_REPOSITORY, type MarketRepositoryPort } from '@/modules/markets/domain/ports';

/** Cache exchangeInfo 1 hour to avoid Binance request weight / IP ban (418). */
const EXCHANGE_INFO_CACHE_KEY = 'exchange:binance:exchangeInfo';
const EXCHANGE_INFO_CACHE_TTL = 3600;

interface BinanceSymbolInfo {
  symbol: string;
  status: string;
  baseAsset: string;
  quoteAsset: string;
  baseAssetPrecision: number;
  quoteAssetPrecision: number;
  quotePrecision: number;
  filters: Array<{
    filterType: string;
    minPrice?: string;
    tickSize?: string;
    minQty?: string;
    stepSize?: string;
    minNotional?: string;
  }>;
}

interface BinanceExchangeInfo {
  symbols: BinanceSymbolInfo[];
}

/**
 * Derive decimal scale from a step/tick string (e.g. "0.01" -> 2, "0.0001" -> 4).
 */
function decimalScaleFromStep(value: string): number {
  const s = String(value).trim();
  if (!s || s === '0') return 0;
  const idx = s.indexOf('.');
  if (idx === -1) return 0;
  const decimals = s.length - idx - 1;
  return Math.min(18, Math.max(0, decimals));
}

@Injectable()
export class ExchangeInfoSyncService {
  private readonly logger = new Logger(ExchangeInfoSyncService.name);

  constructor(
    @Inject(CURRENCY_REPOSITORY)
    private readonly currencyRepository: CurrencyRepositoryPort,
    @Inject(MARKET_REPOSITORY)
    private readonly marketRepository: MarketRepositoryPort,
    private readonly cacheService: CacheService,
    private readonly binanceRestClient: BinanceRestClient,
    private readonly getCurrenciesQuery: GetCurrenciesQuery,
  ) {}

  /**
   * Fetch Binance Spot exchangeInfo (public, no API key).
   * Uses cache (1h) to reduce request weight and avoid 418 IP ban.
   * On 418, throws ServiceUnavailableException with retryAfterMs.
   */
  async fetchBinanceExchangeInfo(forceRefresh = false): Promise<BinanceExchangeInfo> {
    if (!forceRefresh) {
      const cached = await this.cacheService.get<BinanceExchangeInfo>(EXCHANGE_INFO_CACHE_KEY);
      if (cached?.symbols?.length) {
        this.logger.debug('Using cached Binance exchangeInfo');
        return cached;
      }
    }

    const res = await this.binanceRestClient.getPublicText('/api/v3/exchangeInfo');
    const bodyText = res.body;

    if (res.status === 418) {
      // "IP banned until 1771291118565" – parse and return retry-after
      const untilMs = bodyText.match(/IP banned until (\d+)/)?.[1];
      const retryAfterMs = untilMs ? Math.max(0, Number(untilMs) - Date.now()) : null;
      const retryAfterSec = retryAfterMs != null ? Math.ceil(retryAfterMs / 1000) : null;
      throw new ServiceUnavailableException(
        'Binance rate limit: IP temporarily banned. Use WebSocket for live data; retry sync later.',
        'BINANCE_RATE_LIMIT',
        {
          retryAfterMs: retryAfterMs ?? undefined,
          retryAfterSec: retryAfterSec ?? undefined,
          hint: 'Please use WebSocket Streams for live updates to avoid bans.',
        },
      );
    }

    if (!res.ok) {
      throw new Error(`Binance exchangeInfo failed: ${res.status} ${bodyText}`);
    }

    const data = JSON.parse(bodyText) as BinanceExchangeInfo;
    await this.cacheService.set(EXCHANGE_INFO_CACHE_KEY, data, EXCHANGE_INFO_CACHE_TTL);
    return data;
  }

  /**
   * Sync currencies and market pairs from Binance exchangeInfo into DB.
   * - Only symbols with status === 'TRADING'.
   * - Currencies: upsert by symbol (create if not exists).
   * - Market pairs: create if symbol (BASE/QUOTE) not exists; skip if exists.
   * @param forceRefresh If true, bypass cache and fetch fresh exchangeInfo (use sparingly to avoid 418).
   */
  async syncFromBinance(forceRefresh = false): Promise<{
    currenciesCreated: number;
    currenciesSkipped: number;
    pairsCreated: number;
    pairsSkipped: number;
    errors: string[];
  }> {
    const result = {
      currenciesCreated: 0,
      currenciesSkipped: 0,
      pairsCreated: 0,
      pairsSkipped: 0,
      errors: [] as string[],
    };

    const data = await this.fetchBinanceExchangeInfo(forceRefresh);
    const symbols = (data.symbols || []).filter((s: BinanceSymbolInfo) => s.status === 'TRADING');

    const assetSet = new Set<string>();
    for (const s of symbols) {
      assetSet.add(s.baseAsset);
      assetSet.add(s.quoteAsset);
    }

    const symbolToCurrencyId = new Map<string, string>();

    for (const asset of assetSet) {
      try {
        let existing = await this.currencyRepository.findBySymbol(asset);
        if (existing) {
          // sp_market_create requires base/quote rows with is_tradable=1 and is_active=1.
          // Re-enable when Binance still lists the asset on TRADING pairs (stale DB rows).
          if (!existing.is_tradable || !existing.is_active) {
            existing = await this.currencyRepository.update(existing.currency_id, {
              is_tradable: true,
              is_active: true,
            });
          }
          symbolToCurrencyId.set(asset, existing.currency_id);
          result.currenciesSkipped += 1;
          continue;
        }
        const currency = await this.currencyRepository.create({
          symbol: asset,
          name: asset,
          precision_scale: 8,
          min_withdraw: '0',
          is_tradable: true,
          is_active: true,
        });
        symbolToCurrencyId.set(asset, currency.currency_id);
        result.currenciesCreated += 1;
      } catch (err: any) {
        result.errors.push(`Currency ${asset}: ${err?.message || err}`);
      }
    }

    for (const s of symbols) {
      const baseId = symbolToCurrencyId.get(s.baseAsset);
      const quoteId = symbolToCurrencyId.get(s.quoteAsset);
      if (!baseId || !quoteId) {
        result.errors.push(`Pair ${s.symbol}: missing currency`);
        continue;
      }
      const pairSymbol = `${s.baseAsset}/${s.quoteAsset}`;
      try {
        const existing = await this.marketRepository.findBySymbol(pairSymbol);
        if (existing) {
          result.pairsSkipped += 1;
          continue;
        }
        const priceFilter = s.filters?.find((f) => f.filterType === 'PRICE_FILTER');
        const lotFilter = s.filters?.find((f) => f.filterType === 'LOT_SIZE');
        const notionalFilter = s.filters?.find(
          (f) => f.filterType === 'NOTIONAL' || f.filterType === 'MIN_NOTIONAL',
        );

        const price_scale = priceFilter?.tickSize
          ? decimalScaleFromStep(priceFilter.tickSize)
          : Math.min(8, s.baseAssetPrecision ?? 8);
        const amount_scale = lotFilter?.stepSize
          ? decimalScaleFromStep(lotFilter.stepSize)
          : Math.min(8, s.baseAssetPrecision ?? 8);
        const min_order_amount = lotFilter?.minQty || notionalFilter?.minNotional || '0.0001';

        await this.marketRepository.create({
          base_currency_id: baseId,
          quote_currency_id: quoteId,
          symbol: pairSymbol,
          price_scale,
          amount_scale,
          min_order_amount,
          maker_fee_rate: '0.001',
          taker_fee_rate: '0.001',
          is_active: true,
        });
        result.pairsCreated += 1;
      } catch (err: any) {
        result.errors.push(`Pair ${pairSymbol}: ${err?.message || err}`);
      }
    }

    try {
      await this.cacheService.invalidatePattern('currencies:*');
      await this.cacheService.invalidatePattern('markets:*');
    } catch (e) {
      this.logger.warn('Cache invalidation after sync failed', e);
    }

    /** Repopulate Redis (`currencies:active`, `currencies:tradable`, …) so clients do not cold-miss until first HTTP GET. */
    try {
      await Promise.all([
        this.getCurrenciesQuery.getActive(),
        this.getCurrenciesQuery.getTradable(),
      ]);
      this.logger.debug('Currency catalog Redis caches warmed after sync');
    } catch (e) {
      this.logger.warn(
        'Currency cache warm-up after sync failed; keys will refill on next GET /currencies',
        e,
      );
    }

    this.logger.log(
      `Sync done: currencies +${result.currenciesCreated} (skip ${result.currenciesSkipped}), pairs +${result.pairsCreated} (skip ${result.pairsSkipped})`,
    );
    if (result.errors.length) {
      this.logger.warn(`Sync errors: ${result.errors.slice(0, 5).join('; ')}`);
    }
    return result;
  }
}
