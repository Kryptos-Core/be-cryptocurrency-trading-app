import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import type { MarketRepository } from '@/modules/markets/repositories';
import type { ExchangeInfoSyncService } from './exchange-info-sync.service';

@Injectable()
export class MarketCatalogBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(MarketCatalogBootstrapService.name);
  private bootstrapStarted = false;

  constructor(
    private readonly marketRepository: MarketRepository,
    private readonly exchangeInfoSyncService: ExchangeInfoSyncService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (this.bootstrapStarted) {
      return;
    }
    this.bootstrapStarted = true;

    const activeMarketCount = await this.getActiveMarketCount();
    if (activeMarketCount === 0) {
      await this.initializeCatalogFromBinance();
    }
  }

  private async getActiveMarketCount(): Promise<number> {
    const markets = await this.marketRepository.findActive();
    return markets.length;
  }

  private async initializeCatalogFromBinance(): Promise<void> {
    this.logger.log('Market catalog is empty. Syncing real market data from Binance.');

    try {
      const result = await this.exchangeInfoSyncService.syncFromBinance(false);
      const activeMarketCount = await this.getActiveMarketCount();

      this.logger.log(
        `Initial Binance sync completed: +${result.currenciesCreated} currencies, +${result.pairsCreated} pairs.`,
      );
      if (result.errors.length) {
        this.logger.warn(`Initial Binance sync completed with ${result.errors.length} errors.`);
      }

      if (activeMarketCount === 0) {
        throw new Error(
          'Startup bootstrap failed: Binance sync did not populate market catalog while DB is empty.',
        );
      }
    } catch (error: any) {
      const message = error?.message || String(error);
      this.logger.error(
        `Startup aborted: cannot bootstrap market catalog from Binance while DB is empty. Reason: ${message}`,
      );
      throw new Error(
        `Startup bootstrap failed: market catalog is empty and Binance sync failed (${message}).`,
      );
    }
  }
}
