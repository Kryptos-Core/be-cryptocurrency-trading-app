import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '@/common/services/redis.service';
import { CoinGeckoProvider } from './coingecko.provider';

const USD_VND_CACHE_KEY = 'exchange_rate:usd_vnd';
const USD_VND_TTL_SECONDS = 300;
const EXCHANGE_RATE_HOST_ENDPOINT = 'https://api.exchangerate.host/latest?base=USD&symbols=VND';
const EXCHANGE_RATE_HOST_TIMEOUT_MS = 8000;

@Injectable()
export class FiatRateProvider {
  private readonly logger = new Logger(FiatRateProvider.name);

  constructor(
    private readonly redisService: RedisService,
    private readonly coinGeckoProvider: CoinGeckoProvider,
  ) {}

  async getUsdToVndRate(): Promise<{ rate: string; updatedAt: string; source: string }> {
    const cached = await this.readCache();
    if (cached) {
      return cached;
    }

    try {
      const controller = new AbortController();
      const timeoutHandle = setTimeout(() => controller.abort(), EXCHANGE_RATE_HOST_TIMEOUT_MS);
      const response = await fetch(EXCHANGE_RATE_HOST_ENDPOINT, {
        signal: controller.signal,
      }).finally(() => {
        clearTimeout(timeoutHandle);
      });
      if (!response.ok) {
        throw new Error(`exchangerate.host responded with ${response.status}`);
      }

      const payload = (await response.json()) as { rates?: Record<string, number>; date?: string };
      const rate = Number(payload.rates?.VND ?? 0);
      if (!Number.isFinite(rate) || rate <= 0) {
        throw new Error('USD/VND rate unavailable');
      }

      const result = {
        rate: String(rate),
        updatedAt: payload.date ? new Date(payload.date).toISOString() : new Date().toISOString(),
        source: 'exchangerate_host',
      };

      await this.redisService.set(USD_VND_CACHE_KEY, JSON.stringify(result), USD_VND_TTL_SECONDS);
      return result;
    } catch (error) {
      this.logger.warn(`Fiat rate primary source failed: ${(error as Error).message}`);
      const fallback = await this.coinGeckoProvider.getUsdtVndMarketSnapshot();
      const marketRate = Number(fallback.marketRate);
      return {
        rate: (1 / marketRate).toFixed(0),
        updatedAt: fallback.updatedAt,
        source: fallback.source,
      };
    }
  }

  private async readCache(): Promise<{ rate: string; updatedAt: string; source: string } | null> {
    try {
      const raw = await this.redisService.get(USD_VND_CACHE_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as { rate: string; updatedAt: string; source: string };
    } catch {
      return null;
    }
  }
}
