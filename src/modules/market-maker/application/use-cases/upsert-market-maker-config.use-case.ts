import { Injectable } from '@nestjs/common';
import type { UpsertMarketMakerConfigDto } from '../../dto';
import { MarketMakerService } from '../../market-maker.service';

/**
 * UpsertMarketMakerConfigUseCase — creates or updates a market maker config for a trading pair.
 *
 * Thin adapter that delegates to MarketMakerService.upsertConfig.
 */
@Injectable()
export class UpsertMarketMakerConfigUseCase {
  constructor(private readonly marketMakerService: MarketMakerService) {}

  async execute(userId: string, pairId: string, dto: UpsertMarketMakerConfigDto) {
    return this.marketMakerService.upsertConfig(userId, pairId, dto);
  }
}
