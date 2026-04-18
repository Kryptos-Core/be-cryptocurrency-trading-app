import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import {
  CURRENCY_REPOSITORY,
  type CurrencyRepositoryPort,
} from '@/modules/currencies/domain/ports';
import { MARKET_REPOSITORY, type MarketRepositoryPort } from '@/modules/markets/domain/ports';
import { ExchangeInfoSyncService } from './exchange-info-sync.service';

/**
 * Ensures Spot catalog (currencies + market pairs) exists after a wiped DB or partial sync.
 * Mirrors “count active markets → if 0 sync Binance”; also requires active currencies — same upsert pipeline.
 */
@Injectable()
export class MarketCatalogBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(MarketCatalogBootstrapService.name);
  private bootstrapStarted = false;

  constructor(
    @Inject(MARKET_REPOSITORY)
    private readonly marketRepository: MarketRepositoryPort,
    @Inject(CURRENCY_REPOSITORY)
    private readonly currencyRepository: CurrencyRepositoryPort,
    private readonly exchangeInfoSyncService: ExchangeInfoSyncService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (this.bootstrapStarted) {
      return;
    }
    this.bootstrapStarted = true;

    const [activeMarketCount, activeCurrencyCount] = await Promise.all([
      this.getActiveMarketCount(),
      this.getActiveCurrencyCount(),
    ]);

    if (activeMarketCount === 0 || activeCurrencyCount === 0) {
      await this.initializeCatalogFromBinance();
    }
  }

  private async getActiveMarketCount(): Promise<number> {
    const markets = await this.marketRepository.findActive();
    return markets.length;
  }

  private async getActiveCurrencyCount(): Promise<number> {
    const currencies = await this.currencyRepository.findActive();
    return currencies.length;
  }

  private async initializeCatalogFromBinance(): Promise<void> {
    this.logger.log(
      'Market and/or currency catalog is empty. Syncing Spot catalog from Binance (exchangeInfo).',
    );

    try {
      const result = await this.exchangeInfoSyncService.syncFromBinance(false);
      const [activeMarketCount, activeCurrencyCount] = await Promise.all([
        this.getActiveMarketCount(),
        this.getActiveCurrencyCount(),
      ]);

      this.logger.log(
        `Initial Binance sync completed: +${result.currenciesCreated} currencies, +${result.pairsCreated} pairs.`,
      );
      if (result.errors.length) {
        this.logger.warn(`Initial Binance sync completed with ${result.errors.length} errors.`);
      }

      if (activeMarketCount === 0 || activeCurrencyCount === 0) {
        throw new Error(
          'Startup bootstrap failed: Binance sync did not populate active markets and currencies while DB catalog is empty.',
        );
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Startup aborted: cannot bootstrap Spot catalog from Binance while DB is empty. Reason: ${message}`,
      );
      throw new Error(
        `Startup bootstrap failed: Spot catalog is empty and Binance sync failed (${message}).`,
      );
    }
  }
}
