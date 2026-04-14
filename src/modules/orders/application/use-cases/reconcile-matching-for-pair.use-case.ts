import { Injectable } from '@nestjs/common';
import { NotFoundException } from '@/common/exceptions';
import { MarketRepository } from '@/modules/markets/repositories';
import type { MatchingReconcileResult } from '@/modules/matching/interfaces/matching.interface';
import { MatchingService } from '@/modules/matching/matching.service';

@Injectable()
export class ReconcileMatchingForPairUseCase {
  constructor(
    private readonly marketRepository: MarketRepository,
    private readonly matchingService: MatchingService,
  ) {}

  async execute(pairIdOrSymbol: string): Promise<MatchingReconcileResult> {
    const raw = (pairIdOrSymbol ?? '').trim();
    let pair = await this.marketRepository.findById(raw);
    if (!pair && raw.includes('/')) {
      pair = await this.marketRepository.findBySymbol(raw);
    }
    if (!pair) {
      throw new NotFoundException('Market pair', raw);
    }
    return this.matchingService.reconcileOpenOrdersForPair({
      pairId: String(pair.pair_id),
      feeCurrencyId: pair.quote_currency_id,
      makerFeeRate: pair.maker_fee_rate ?? '0.001',
      takerFeeRate: pair.taker_fee_rate ?? '0.001',
    });
  }
}
