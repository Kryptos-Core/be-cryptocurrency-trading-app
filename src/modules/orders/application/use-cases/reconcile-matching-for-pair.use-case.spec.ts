import { Test } from '@nestjs/testing';
import { NotFoundException } from '@/common/exceptions';
import { MARKET_REPOSITORY } from '@/modules/markets/domain/ports';
import { MatchingShadowReconciliationUseCase } from '@/modules/matching/application/use-cases';
import { ORDER_MATCHING_GATEWAY } from '@/modules/orders/domain/ports';
import { MetricsService } from '@/telemetry';
import { ReconcileMatchingForPairUseCase } from '@/modules/orders/application/use-cases/reconcile-matching-for-pair.use-case';

describe('ReconcileMatchingForPairUseCase', () => {
  const marketRepository = {
    findById: jest.fn(),
    findBySymbol: jest.fn(),
  };
  const orderMatchingGateway = {
    reconcileOpenOrdersForPair: jest.fn(),
  };
  const matchingShadowReconciliationUseCase = {
    execute: jest.fn(),
  };
  const metricsService = {
    setMatchingShadowRuns: jest.fn(),
    setMatchingShadowMissingTrades: jest.fn(),
    setMatchingShadowMatchRatePercent: jest.fn(),
  };

  let useCase: ReconcileMatchingForPairUseCase;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        ReconcileMatchingForPairUseCase,
        { provide: MARKET_REPOSITORY, useValue: marketRepository },
        { provide: ORDER_MATCHING_GATEWAY, useValue: orderMatchingGateway },
        {
          provide: MatchingShadowReconciliationUseCase,
          useValue: matchingShadowReconciliationUseCase,
        },
        { provide: MetricsService, useValue: metricsService },
      ],
    }).compile();

    useCase = moduleRef.get(ReconcileMatchingForPairUseCase);
  });

  it('resolves by symbol when pair id lookup misses', async () => {
    marketRepository.findById.mockResolvedValue(null);
    marketRepository.findBySymbol.mockResolvedValue({
      pair_id: 'pair-1',
      quote_currency_id: 'quote-1',
      maker_fee_rate: '0.001',
      taker_fee_rate: '0.002',
    });
    orderMatchingGateway.reconcileOpenOrdersForPair.mockResolvedValue({ pairId: 'pair-1' });

    const result = await useCase.execute('BTC/USDT');

    expect(marketRepository.findBySymbol).toHaveBeenCalledWith('BTC/USDT');
    expect(orderMatchingGateway.reconcileOpenOrdersForPair).toHaveBeenCalledWith({
      pairId: 'pair-1',
      feeCurrencyId: 'quote-1',
      makerFeeRate: '0.001',
      takerFeeRate: '0.002',
    });
    expect(result).toEqual({ pairId: 'pair-1' });
  });

  it('throws when pair is missing', async () => {
    marketRepository.findById.mockResolvedValue(null);
    marketRepository.findBySymbol.mockResolvedValue(null);

    await expect(useCase.execute('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns shadow parity summary for a pair and publishes metrics', async () => {
    marketRepository.findById.mockResolvedValue({
      pair_id: 'pair-1',
      quote_currency_id: 'quote-1',
      maker_fee_rate: '0.001',
      taker_fee_rate: '0.002',
    });
    matchingShadowReconciliationUseCase.execute.mockResolvedValue({
      pairId: 'pair-1',
      windowHours: 24,
      shadowRuns: 10,
      matchedTrades: 9,
      matchedShadowRuns: 9,
      unmatchedShadowRuns: 1,
      missingTrades: 1,
      matchRatePercent: 90,
      unmatchedOrderIds: ['order-x'],
      recentRuns: [],
    });

    const result = await useCase.shadowParity('pair-1', 24, 20);

    expect(matchingShadowReconciliationUseCase.execute).toHaveBeenCalledWith({
      pairId: 'pair-1',
      windowHours: 24,
      limit: 20,
    });
    expect(metricsService.setMatchingShadowRuns).toHaveBeenCalledWith('pair-1', 10);
    expect(metricsService.setMatchingShadowMissingTrades).toHaveBeenCalledWith('pair-1', 1);
    expect(metricsService.setMatchingShadowMatchRatePercent).toHaveBeenCalledWith('pair-1', 90);
    expect(result).toEqual(
      expect.objectContaining({
        pairId: 'pair-1',
        shadowRuns: 10,
      }),
    );
  });
});
