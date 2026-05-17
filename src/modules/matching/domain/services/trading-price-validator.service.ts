import { Injectable, Logger } from '@nestjs/common';
import Decimal from 'decimal.js';
import { CoinGeckoProvider } from '@/modules/exchange-rate/providers/coingecko.provider';
import { SystemConfigService } from '@/modules/system-config/system-config.service';

export interface MarketPriceRef {
  symbol: string;
  priceUsd: string;
  priceVnd: string;
  updatedAt: string;
  staleMs: number;
  stale: boolean; // computed: staleMs > DEFAULT_PRICE_STALE_THRESHOLD_MS
}

export interface PriceValidationResult {
  valid: boolean;
  marketPrice: string;
  tradePrice: string;
  deviationPct: string;
  maxAllowedPct: string;
  stale: boolean;
  staleMs?: number;
  reason?: string;
}

const DEFAULT_MAX_SLIPPAGE_RATIO = 0.01; // 1% = 0.01 as decimal ratio
const DEFAULT_PRICE_STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes (300000ms)

/**
 * TradingPriceValidatorService
 *
 * Validates that trade prices on the internal order book are within acceptable
 * deviation of real-time market prices (via CoinGecko), preventing price manipulation
 * attacks where an attacker places a stale limit order and tricks users into
 * trading at a manipulated price.
 *
 * Design choices:
 *   - CoinsGecko: primary market price source (60s cache already in place)
 *   - Max slippage: configurable via system config key 'trading.max_slippage_pct'
 *   - Stale threshold: prices older than 5 min are considered stale and flagged
 *   - Non-blocking: validation failures do NOT roll back orders — they flag for
 *     review and log warnings. Blocking all trades on stale prices would be too
 *     aggressive (weekend/low-liquidity periods).
 *   - For production real-time millisecond feeds: integrate Binance WebSocket
 *     as a future upgrade path.
 */
@Injectable()
export class TradingPriceValidatorService {
  private readonly logger = new Logger(TradingPriceValidatorService.name);

  constructor(
    private readonly coinGeckoProvider: CoinGeckoProvider,
    private readonly systemConfigService: SystemConfigService,
  ) {}

  /**
   * Validate that the trade price is within acceptable deviation of the market price.
   *
   * @param pairId  e.g. "BTC_USDT" — extracts the quote symbol for price lookup
   * @param tradePrice  the price at which the trade is being executed
   * @param side  BUY or SELL — determines whether deviation is favorable or adverse
   */
  async validate(
    pairId: string,
    tradePrice: string,
    side: 'BUY' | 'SELL',
  ): Promise<PriceValidationResult> {
    const [baseSymbol] = pairId.split('_');
    if (!baseSymbol) {
      return {
        valid: true,
        marketPrice: '0',
        tradePrice,
        deviationPct: '0',
        maxAllowedPct: String(DEFAULT_MAX_SLIPPAGE_RATIO * 100),
        stale: false,
        reason: 'Cannot parse pairId for symbol extraction',
      };
    }

    const marketRef = await this.getMarketPriceRef(baseSymbol);
    const maxSlippagePct = await this.resolveMaxSlippagePct();

    if (marketRef.stale) {
      this.logger.warn(
        `[TradingPriceValidator] Market price for ${baseSymbol} is stale (age=${marketRef.staleMs}ms). ` +
          `Trade price=${tradePrice} market=${marketRef.priceUsd}`,
      );
    }

    const marketPrice = new Decimal(marketRef.priceUsd);
    const tradeDecimal = new Decimal(tradePrice);

    if (marketPrice.lte(0) || tradeDecimal.lte(0)) {
      return {
        valid: false,
        marketPrice: marketRef.priceUsd,
        tradePrice,
        deviationPct: '0',
        maxAllowedPct: String(maxSlippagePct),
        stale: marketRef.stale,
        reason: marketRef.stale
          ? `Market price unavailable (${baseSymbol} not found or price feed down). Cannot validate.`
          : 'Invalid price: market or trade price must be positive',
      };
    }

    // Calculate deviation as absolute percentage difference
    // Config stores '0.01' meaning 0.01 = 1% threshold.
    // Both deviation and maxAllowed are in percentage units for comparison.
    const deviation = tradeDecimal.minus(marketPrice).abs().div(marketPrice).mul(100);
    const maxAllowed = new Decimal(maxSlippagePct);

    const result: PriceValidationResult = {
      valid: deviation.lte(maxAllowed),
      marketPrice: marketRef.priceUsd,
      tradePrice,
      deviationPct: deviation.toFixed(6),
      maxAllowedPct: String(maxSlippagePct),
      stale: marketRef.stale,
      staleMs: marketRef.staleMs,
    };

    if (!result.valid) {
      result.reason =
        `Trade price deviates ${deviation.toFixed(4)}% from market (max allowed: ${maxSlippagePct}%). ` +
        `Side=${side} pair=${pairId} market=${marketRef.priceUsd} trade=${tradePrice}. ` +
        `This may indicate price manipulation or stale order book.`;
      this.logger.warn(
        `[TradingPriceValidator] PRICE MANIPULATION SUSPECTED: pair=${pairId} side=${side} ` +
          `market=${marketRef.priceUsd} trade=${tradePrice} deviation=${deviation.toFixed(4)}% ` +
          `maxAllowed=${maxSlippagePct}% stale=${marketRef.stale}`,
      );
    } else if (marketRef.stale) {
      result.reason = `Market price is stale (${marketRef.staleMs}ms old). Proceeding with caution.`;
    }

    return result;
  }

  /**
   * Get market price for a given symbol, with staleness indicator.
   */
  private async getMarketPriceRef(symbol: string): Promise<MarketPriceRef> {
    const staleThreshold = await this.resolveStaleThresholdMs();
    try {
      const snapshot = await this.coinGeckoProvider.getMarketPrices([symbol]);
      const item = snapshot.prices.find(
        (p) => p.symbol.toUpperCase() === symbol.toUpperCase(),
      );
      if (!item) {
        return this.staleRef(symbol);
      }
      const updatedAt = new Date(snapshot.updatedAt);
      const staleMs = Date.now() - updatedAt.getTime();
      return {
        symbol,
        priceUsd: item.priceUsd,
        priceVnd: item.priceVnd,
        updatedAt: snapshot.updatedAt,
        staleMs,
        stale: staleMs > staleThreshold,
      };
    } catch (error) {
      this.logger.warn(
        `[TradingPriceValidator] Failed to fetch market price for ${symbol}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return this.staleRef(symbol);
    }
  }

  private async resolveStaleThresholdMs(): Promise<number> {
    try {
      const val = await this.systemConfigService.get<string>('trading.price_stale_threshold_ms');
      if (val !== null) {
        const parsed = parseFloat(val);
        if (Number.isFinite(parsed) && parsed > 0) {
          return parsed;
        }
      }
      return DEFAULT_PRICE_STALE_THRESHOLD_MS;
    } catch {
      return DEFAULT_PRICE_STALE_THRESHOLD_MS;
    }
  }

  // Config stores '0.01' meaning 0.01 decimal = 1%.
  // To store as percentage value, parse to float then multiply by 100.
  // So '0.01' → 0.01 * 100 = 1 (meaning 1%).
  private async resolveMaxSlippagePct(): Promise<string> {
    try {
      const val = await this.systemConfigService.get<string>('trading.max_slippage_pct');
      if (val !== null) {
        const parsed = parseFloat(val);
        if (Number.isFinite(parsed) && parsed > 0 && parsed <= 100) {
          return String(parsed * 100);
        }
      }
      return String(DEFAULT_MAX_SLIPPAGE_RATIO * 100);
    } catch {
      return String(DEFAULT_MAX_SLIPPAGE_RATIO * 100);
    }
  }

  private staleRef(symbol: string): MarketPriceRef {
    return {
      symbol,
      priceUsd: '0.000001', // Non-zero placeholder so validation can proceed (marked stale)
      priceVnd: '0.000001',
      updatedAt: new Date(0).toISOString(),
      staleMs: Infinity,
      stale: true,
    };
  }
}
