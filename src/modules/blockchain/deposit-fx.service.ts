import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Decimal from 'decimal.js';
import { CacheService } from '@/common/services';
import { CurrencyRepository } from '@/modules/currencies/repositories';
import { BlockchainNetwork } from '@/common/enums';

export interface DepositConversionResult {
  /** ID của currency platform cash (USDT) sẽ được credit vào ví user (UUID) */
  creditCurrencyId: string;
  /** Số lượng USDT sẽ được credit */
  creditAmount: string;
  /** Tỷ giá quy đổi: 1 native coin = X USDT */
  conversionRate: string;
  /** Số lượng native coin gốc (TRX/ETH...) */
  originalAmount: string;
}

/**
 * DepositFxService — Strategy Pattern + Cache-Aside
 *
 * Chịu trách nhiệm duy nhất: convert số lượng native coin (TRX, ETH, SOL)
 * sang platform cash currency (USDT) khi user nạp tiền on-chain.
 *
 * Ưu tiên lấy tỷ giá theo thứ tự:
 *  1. Redis cache (TTL 60s) → tránh spam Binance API
 *  2. Binance public ticker API (không cần auth)
 *  3. Config fallback (BLOCKCHAIN_DEPOSIT_<SYMBOL>_TO_USDT_RATE) → testnet/offline
 */
@Injectable()
export class DepositFxService {
  private readonly logger = new Logger(DepositFxService.name);
  private static readonly PRICE_CACHE_TTL = 60; // giây
  private readonly cashCurrencySymbol: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly cacheService: CacheService,
    private readonly currencyRepository: CurrencyRepository,
  ) {
    this.cashCurrencySymbol =
      this.configService.get<string>('PLATFORM_CASH_CURRENCY_SYMBOL')?.trim().toUpperCase() ||
      this.configService.get<string>('PAYOS_DEPOSIT_CURRENCY_SYMBOL')?.trim().toUpperCase() ||
      'USDT';
  }

  /**
   * Chuyển đổi số lượng native coin → platform cash (USDT).
   * Được gọi trong settleDepositLedgerIfNeeded() thay vì credit coin trực tiếp.
   */
  async convertToPlatformCash(
    chain: BlockchainNetwork,
    nativeAmount: string,
  ): Promise<DepositConversionResult> {
    const nativeSymbol = this.getNativeSymbol(chain);
    const creditCurrencyId = await this.resolveCashCurrencyId();

    // Nếu native coin ĐÃ là cash currency (ví dụ deposit USDT trực tiếp), skip conversion
    if (nativeSymbol.toUpperCase() === this.cashCurrencySymbol.toUpperCase()) {
      return {
        creditCurrencyId,
        creditAmount: nativeAmount,
        conversionRate: '1',
        originalAmount: nativeAmount,
      };
    }

    const rate = await this.fetchConversionRate(nativeSymbol, this.cashCurrencySymbol);
    const creditAmount = new Decimal(nativeAmount)
      .mul(rate)
      .toFixed(8, Decimal.ROUND_DOWN);

    this.logger.log(
      `[DepositFx] ${nativeAmount} ${nativeSymbol} → ${creditAmount} ${this.cashCurrencySymbol} (rate=${rate})`,
    );

    return {
      creditCurrencyId,
      creditAmount,
      conversionRate: rate,
      originalAmount: nativeAmount,
    };
  }

  /**
   * Lấy tỷ giá native→USDT với cache Redis.
   * Thứ tự ưu tiên: Redis cache → Binance API → config fallback.
   */
  async fetchConversionRate(
    fromSymbol: string,
    toSymbol: string,
  ): Promise<string> {
    const pair = `${fromSymbol.toUpperCase()}${toSymbol.toUpperCase()}`;
    const cacheKey = `price:oracle:${pair}`;

    const cached = await this.cacheService.get<string>(cacheKey);
    if (cached) {
      return cached;
    }

    let rate: string | null = null;

    // Thử Binance public API
    try {
      rate = await this.fetchFromBinance(pair);
    } catch (err: any) {
      this.logger.warn(`[DepositFx] Binance API failed for ${pair}: ${err?.message}`);
    }

    // Fallback: config cứng
    if (!rate) {
      rate = this.getConfigFallbackRate(fromSymbol);
    }

    if (!rate) {
      throw new Error(
        `Cannot resolve conversion rate for ${pair}. ` +
        `Set BLOCKCHAIN_DEPOSIT_${fromSymbol.toUpperCase()}_TO_USDT_RATE in config.`,
      );
    }

    await this.cacheService.set(cacheKey, rate, DepositFxService.PRICE_CACHE_TTL);
    return rate;
  }

  private async fetchFromBinance(pair: string): Promise<string> {
    const url = `https://api.binance.com/api/v3/ticker/price?symbol=${pair}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) {
        throw new Error(`Binance returned HTTP ${res.status}`);
      }
      const data = await res.json() as { price?: string };
      const price = data?.price;
      if (!price || isNaN(Number(price)) || Number(price) <= 0) {
        throw new Error(`Invalid price from Binance: ${price}`);
      }
      return price;
    } finally {
      clearTimeout(timeout);
    }
  }

  private getConfigFallbackRate(fromSymbol: string): string | null {
    const key = `BLOCKCHAIN_DEPOSIT_${fromSymbol.toUpperCase()}_TO_USDT_RATE`;
    const val = this.configService.get<string>(key)?.trim();
    if (val && !isNaN(Number(val)) && Number(val) > 0) {
      return val;
    }
    return null;
  }

  private getNativeSymbol(chain: BlockchainNetwork): string {
    switch (chain) {
      case BlockchainNetwork.ETH_SEPOLIA:
        return this.configService.get<string>('BLOCKCHAIN_WITHDRAW_ETH_SYMBOL')?.trim().toUpperCase() || 'ETH';
      case BlockchainNetwork.SOLANA_DEVNET:
        return this.configService.get<string>('BLOCKCHAIN_WITHDRAW_SOL_SYMBOL')?.trim().toUpperCase() || 'SOL';
      case BlockchainNetwork.TRON_NILE:
      case BlockchainNetwork.TRON_SHASTA:
        return this.configService.get<string>('BLOCKCHAIN_WITHDRAW_TRON_SYMBOL')?.trim().toUpperCase() || 'TRX';
      default:
        throw new Error(`Unsupported chain for deposit FX: ${chain}`);
    }
  }

  private async resolveCashCurrencyId(): Promise<string> {
    const currency = await this.currencyRepository.findBySymbol(this.cashCurrencySymbol);
    if (!currency?.currency_id) {
      throw new Error(
        `Platform cash currency "${this.cashCurrencySymbol}" not found in DB. ` +
        `Ensure PLATFORM_CASH_CURRENCY_SYMBOL is set to a valid currency symbol.`,
      );
    }
    return String(currency.currency_id);
  }
}
