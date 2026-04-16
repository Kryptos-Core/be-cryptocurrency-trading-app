import { Injectable } from '@nestjs/common';
import { MarketMakerService } from '../../market-maker.service';

/**
 * DeleteMarketMakerConfigUseCase — deletes a market maker config for a trading pair.
 *
 * Thin adapter that delegates to MarketMakerService.deleteConfig.
 */
@Injectable()
export class DeleteMarketMakerConfigUseCase {
  constructor(private readonly marketMakerService: MarketMakerService) {}

  async execute(userId: string, pairId: string) {
    return this.marketMakerService.deleteConfig(userId, pairId);
  }
}
