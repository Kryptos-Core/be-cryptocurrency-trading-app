import { Inject, Injectable, Logger } from '@nestjs/common';
import { RedisService } from '@/common/services/redis.service';
import {
  CURRENCY_REPOSITORY,
  type CurrencyRepositoryPort,
} from '@/modules/currencies/domain/ports';
import type {
  MarketPriceItem,
  MarketPricesSnapshot,
  UsdtVndMarketSnapshot,
} from '../interfaces/rate-provider.interface';

const MARKET_PRICES_CACHE_KEY = 'exchange_rate:market_prices';
const MARKET_PRICES_TTL_SECONDS = 60;
const COINGECKO_ENDPOINT = 'https://api.coingecko.com/api/v3/simple/price';
const COINGECKO_TIMEOUT_MS = 8000;

const SYMBOL_TO_ID: Record<string, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  USDT: 'tether',
  SOL: 'solana',
  BNB: 'binancecoin',
  XRP: 'ripple',
  ADA: 'cardano',
  DOGE: 'dogecoin',
  TRX: 'tron',
};

const ID_TO_SYMBOL = Object.fromEntries(
  Object.entries(SYMBOL_TO_ID).map(([symbol, id]) => [id, symbol]),
) as Record<string, string>;

@Injectable()
export class CoinGeckoProvider {
  private readonly logger = new Logger(CoinGeckoProvider.name);

  constructor(
    private readonly redisService: RedisService,
    @Inject(CURRENCY_REPOSITORY)
    private readonly currencyRepository: CurrencyRepositoryPort,
  ) {}

  async getMarketPrices(symbols?: string[]): Promise<MarketPricesSnapshot> {
    const targetSymbols = await this.resolveSymbols(symbols);
    if (targetSymbols.length === 0) {
      return { prices: [], updatedAt: new Date().toISOString() };
    }

    const cached = await this.readCache();
    if (cached && this.snapshotCoversSymbols(cached, targetSymbols)) {
      return this.filterSnapshot(cached, targetSymbols);
    }

    const ids = targetSymbols.map((symbol) => SYMBOL_TO_ID[symbol]).filter(Boolean);

    try {
      const url = new URL(COINGECKO_ENDPOINT);
      url.searchParams.set('ids', ids.join(','));
      url.searchParams.set('vs_currencies', 'usd,vnd');

      const controller = new AbortController();
      const timeoutHandle = setTimeout(() => controller.abort(), COINGECKO_TIMEOUT_MS);

      const response = await fetch(url.toString(), { signal: controller.signal }).finally(() => {
        clearTimeout(timeoutHandle);
      });
      if (!response.ok) {
        throw new Error(`CoinGecko responded with ${response.status}`);
      }

      const payload = (await response.json()) as Record<string, { usd?: number; vnd?: number }>;
      const prices = ids
        .map((id) => this.mapPrice(id, payload[id]))
        .filter((item): item is MarketPriceItem => item !== null);

      const snapshot: MarketPricesSnapshot = {
        prices,
        updatedAt: new Date().toISOString(),
      };

      await this.redisService.set(
        MARKET_PRICES_CACHE_KEY,
        JSON.stringify(snapshot),
        MARKET_PRICES_TTL_SECONDS,
      );

      return this.filterSnapshot(snapshot, targetSymbols);
    } catch (error) {
      this.logger.warn(`CoinGecko fetch failed: ${(error as Error).message}`);
      if (cached) {
        return this.filterSnapshot(cached, targetSymbols);
      }
      throw error;
    }
  }

  async getUsdtVndMarketSnapshot(): Promise<UsdtVndMarketSnapshot> {
    const snapshot = await this.getMarketPrices(['USDT']);
    const usdt = snapshot.prices.find((item) => item.symbol === 'USDT');
    const priceVnd = Number(usdt?.priceVnd ?? '0');
    if (!Number.isFinite(priceVnd) || priceVnd <= 0) {
      throw new Error('USDT/VND market price unavailable');
    }

    return {
      marketRate: (1 / priceVnd).toFixed(8),
      updatedAt: snapshot.updatedAt,
      source: 'coingecko',
    };
  }

  private async resolveSymbols(symbols?: string[]): Promise<string[]> {
    const normalized = (symbols ?? []).map((symbol) => symbol.trim().toUpperCase()).filter(Boolean);
    if (normalized.length > 0) {
      return normalized.filter((symbol) => SYMBOL_TO_ID[symbol]);
    }

    const activeCurrencies = await this.currencyRepository.findActive();
    return activeCurrencies
      .map((currency) => currency.symbol.trim().toUpperCase())
      .filter((symbol, index, arr) => SYMBOL_TO_ID[symbol] && arr.indexOf(symbol) === index);
  }

  private async readCache(): Promise<MarketPricesSnapshot | null> {
    try {
      const raw = await this.redisService.get(MARKET_PRICES_CACHE_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as MarketPricesSnapshot;
    } catch {
      return null;
    }
  }

  private filterSnapshot(snapshot: MarketPricesSnapshot, symbols?: string[]): MarketPricesSnapshot {
    if (!symbols || symbols.length === 0) {
      return snapshot;
    }

    const allowed = new Set(symbols.map((symbol) => symbol.trim().toUpperCase()));
    return {
      ...snapshot,
      prices: snapshot.prices.filter((item) => allowed.has(item.symbol)),
    };
  }

  private snapshotCoversSymbols(snapshot: MarketPricesSnapshot, symbols: string[]): boolean {
    const available = new Set(snapshot.prices.map((item) => item.symbol));
    return symbols.every((symbol) => available.has(symbol));
  }

  private mapPrice(id: string, payload?: { usd?: number; vnd?: number }): MarketPriceItem | null {
    const symbol = ID_TO_SYMBOL[id];
    if (!symbol || payload?.usd == null || payload.vnd == null) {
      return null;
    }

    return {
      symbol,
      priceUsd: String(payload.usd),
      priceVnd: String(payload.vnd),
    };
  }
}
