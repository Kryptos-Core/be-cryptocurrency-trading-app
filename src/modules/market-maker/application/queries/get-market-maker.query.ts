import { Injectable } from '@nestjs/common';
import { MarketMakerService } from '../../market-maker.service';

/**
 * GetMarketMakerQuery — read-only queries for market maker data.
 *
 * Separates reads from writes following CQS principle.
 * Delegates to MarketMakerService.
 */
@Injectable()
export class GetMarketMakerQuery {
  constructor(private readonly marketMakerService: MarketMakerService) {}

  async getConfigList(userId: string) {
    return this.marketMakerService.getConfigList(userId);
  }

  async getFormDefaults() {
    return this.marketMakerService.getFormDefaults();
  }

  async getConfigByPair(userId: string, pairId: string) {
    return this.marketMakerService.getConfigByPair(userId, pairId);
  }

  async getDashboard(userId: string) {
    return this.marketMakerService.getDashboard(userId);
  }
}
