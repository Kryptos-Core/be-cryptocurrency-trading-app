import { Injectable, Logger } from '@nestjs/common';
import { CacheService } from '@/common/services';
import { CurrencyRepository } from '@/modules/currencies/repositories';
import { MarketRepository } from '@/modules/markets/repositories';

const BINANCE_EXCHANGE_INFO_URL = 'https://api.binance.com/api/v3/exchangeInfo';

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
    private readonly currencyRepository: CurrencyRepository,
    private readonly marketRepository: MarketRepository,
    private readonly cacheService: CacheService,
  ) {}

  /**
   * Fetch Binance Spot exchangeInfo (public, no API key).
   */
  async fetchBinanceExchangeInfo(): Promise<BinanceExchangeInfo> {
    const res = await fetch(BINANCE_EXCHANGE_INFO_URL);
    if (!res.ok) {
      throw new Error(`Binance exchangeInfo failed: ${res.status} ${await res.text()}`);
    }
    return (await res.json()) as BinanceExchangeInfo;
  }

  /**
   * Sync currencies and market pairs from Binance exchangeInfo into DB.
   * - Only symbols with status === 'TRADING'.
   * - Currencies: upsert by symbol (create if not exists).
   * - Market pairs: create if symbol (BASE/QUOTE) not exists; skip if exists.
   */
  async syncFromBinance(): Promise<{
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

    const data = await this.fetchBinanceExchangeInfo();
    const symbols = (data.symbols || []).filter(
      (s: BinanceSymbolInfo) => s.status === 'TRADING',
    );

    const assetSet = new Set<string>();
    for (const s of symbols) {
      assetSet.add(s.baseAsset);
      assetSet.add(s.quoteAsset);
    }

    const symbolToCurrencyId = new Map<string, string>();

    for (const asset of assetSet) {
      try {
        const existing = await this.currencyRepository.findBySymbol(asset);
        if (existing) {
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
        const min_order_amount =
          lotFilter?.minQty || notionalFilter?.minNotional || '0.0001';

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

    this.logger.log(
      `Sync done: currencies +${result.currenciesCreated} (skip ${result.currenciesSkipped}), pairs +${result.pairsCreated} (skip ${result.pairsSkipped})`,
    );
    if (result.errors.length) {
      this.logger.warn(`Sync errors: ${result.errors.slice(0, 5).join('; ')}`);
    }
    return result;
  }
}
