import { Inject, Injectable } from '@nestjs/common';
import { NotFoundException } from '@/common/exceptions';
import { MARKET_REPOSITORY, type MarketRepositoryPort } from '@/modules/markets/domain/ports';
import { MatchingShadowReconciliationUseCase } from '@/modules/matching/application/use-cases';
import {
  type MatchingReconcileResultSnapshot,
  ORDER_MATCHING_GATEWAY,
  type OrderMatchingGatewayPort,
} from '@/modules/orders/domain/ports';
import { MetricsService } from '@/telemetry';

@Injectable()
export class ReconcileMatchingForPairUseCase {
  async shadowParity(pairIdOrSymbol: string, windowHours = 24, limit = 20) {
    const raw = (pairIdOrSymbol ?? '').trim();
    let pair = await this.marketRepository.findById(raw);
    if (!pair && raw.includes('/')) {
      pair = await this.marketRepository.findBySymbol(raw);
    }
    if (!pair) {
      throw new NotFoundException('Market pair', raw);
    }

    const summary = await this.matchingShadowReconciliationUseCase.execute({
      pairId: String(pair.pair_id),
      windowHours,
      limit,
    });

    this.metricsService.setMatchingShadowRuns(summary.pairId, summary.shadowRuns);
    this.metricsService.setMatchingShadowMissingTrades(summary.pairId, summary.missingTrades);
    this.metricsService.setMatchingShadowMatchRatePercent(summary.pairId, summary.matchRatePercent);

    return summary;
  }

  constructor(
    @Inject(MARKET_REPOSITORY)
    private readonly marketRepository: MarketRepositoryPort,
    @Inject(ORDER_MATCHING_GATEWAY)
    private readonly orderMatchingGateway: OrderMatchingGatewayPort,
    private readonly matchingShadowReconciliationUseCase: MatchingShadowReconciliationUseCase,
    private readonly metricsService: MetricsService,
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
