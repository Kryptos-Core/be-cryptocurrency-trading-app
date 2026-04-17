import { Inject, Injectable } from '@nestjs/common';
import { NotFoundException } from '@/common/exceptions';
import { MARKET_REPOSITORY, type MarketRepositoryPort } from '@/modules/markets/domain/ports';
import {
  ReconcileOpenOrdersForPairCommand,
  ReconcileOpenOrdersForPairUseCase as MatchingReconcileOpenOrdersForPairUseCase,
} from '@/modules/matching/application/use-cases';
import type { MatchingReconcileResult } from '@/modules/matching/interfaces/matching.interface';

@Injectable()
export class ReconcileMatchingForPairUseCase {
  constructor(
    @Inject(MARKET_REPOSITORY)
    private readonly marketRepository: MarketRepositoryPort,
    private readonly reconcileOpenOrdersForPairUseCase: MatchingReconcileOpenOrdersForPairUseCase,
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
    return this.reconcileOpenOrdersForPairUseCase.execute(
      new ReconcileOpenOrdersForPairCommand(
        String(pair.pair_id),
        pair.quote_currency_id,
        pair.maker_fee_rate ?? '0.001',
        pair.taker_fee_rate ?? '0.001',
      ),
    );
  }
}
