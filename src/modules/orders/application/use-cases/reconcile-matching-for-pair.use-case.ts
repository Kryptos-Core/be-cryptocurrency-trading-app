import { Inject, Injectable } from '@nestjs/common';
import { NotFoundException } from '@/common/exceptions';
import { MARKET_REPOSITORY, type MarketRepositoryPort } from '@/modules/markets/domain/ports';
import {
  type MatchingReconcileResultSnapshot,
  ORDER_MATCHING_GATEWAY,
  type OrderMatchingGatewayPort,
} from '@/modules/orders/domain/ports';

@Injectable()
export class ReconcileMatchingForPairUseCase {
  constructor(
    @Inject(MARKET_REPOSITORY)
    private readonly marketRepository: MarketRepositoryPort,
    @Inject(ORDER_MATCHING_GATEWAY)
    private readonly orderMatchingGateway: OrderMatchingGatewayPort,
  ) {}

  async execute(pairIdOrSymbol: string): Promise<MatchingReconcileResultSnapshot> {
    const raw = (pairIdOrSymbol ?? '').trim();
    let pair = await this.marketRepository.findById(raw);
    if (!pair && raw.includes('/')) {
      pair = await this.marketRepository.findBySymbol(raw);
    }
    if (!pair) {
      throw new NotFoundException('Market pair', raw);
    }
    return this.orderMatchingGateway.reconcileOpenOrdersForPair({
      pairId: String(pair.pair_id),
      feeCurrencyId: pair.quote_currency_id,
      makerFeeRate: pair.maker_fee_rate ?? '0.001',
      takerFeeRate: pair.taker_fee_rate ?? '0.001',
    });
  }
}
