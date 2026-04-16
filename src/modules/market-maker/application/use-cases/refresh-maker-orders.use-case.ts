import { Injectable } from '@nestjs/common';
import type { RefreshMakerOrdersDto } from '../../dto';
import { MarketMakerService } from '../../market-maker.service';

/**
 * RefreshMakerOrdersUseCase — cancels open maker orders and re-places two-sided maker orders.
 *
 * Thin adapter that delegates to MarketMakerService.refreshMakerOrders.
 */
@Injectable()
export class RefreshMakerOrdersUseCase {
  constructor(private readonly marketMakerService: MarketMakerService) {}

  async execute(userId: string, pairId: string, dto?: RefreshMakerOrdersDto) {
    return this.marketMakerService.refreshMakerOrders(
      userId,
      pairId,
      dto?.refresh_cycle_key,
      dto?.order_amount_override,
    );
  }
}
