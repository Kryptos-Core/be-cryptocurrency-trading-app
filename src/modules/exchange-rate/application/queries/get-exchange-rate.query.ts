import { Injectable } from '@nestjs/common';
import type { MarketPricesDto } from '../../dto/market-prices.dto';
import type { RatePreviewDto } from '../../dto/rate-preview.dto';
import { ExchangeRateService } from '../../exchange-rate.service';

/**
 * GetExchangeRateQuery — read-only queries for exchange rate data.
 *
 * Separates reads from writes following CQS principle.
 * Delegates to ExchangeRateService.
 */
@Injectable()
export class GetExchangeRateQuery {
  constructor(private readonly exchangeRateService: ExchangeRateService) {}

  async getMarketPrices(query: MarketPricesDto) {
    return this.exchangeRateService.getMarketPrices(query);
  }

  async getDepositPreview(dto: RatePreviewDto) {
    return this.exchangeRateService.getDepositPreview(dto);
  }

  async getAdminCurrentConfig() {
    return this.exchangeRateService.getAdminCurrentConfig();
  }
}
