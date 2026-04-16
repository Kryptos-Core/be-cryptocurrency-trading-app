import { Injectable } from '@nestjs/common';
import { MarketMakerService } from '../../market-maker.service';

/**
 * PlaceMakerOrdersUseCase — places two-sided maker orders around Redis mid price.
 *
 * Thin adapter that delegates to MarketMakerService.placeMakerOrders.
 */
@Injectable()
export class PlaceMakerOrdersUseCase {
  constructor(private readonly marketMakerService: MarketMakerService) {}

  async execute(userId: string, pairId: string, orderAmountOverride?: string) {
    return this.marketMakerService.placeMakerOrders(userId, pairId, orderAmountOverride);
  }
}
