import { Test } from '@nestjs/testing';
import { NotFoundException } from '@/common/exceptions';
import { MARKET_REPOSITORY } from '@/modules/markets/domain/ports';
import { ReconcileMatchingForPairUseCase } from '@/modules/orders/application/use-cases/reconcile-matching-for-pair.use-case';
import { ORDER_MATCHING_GATEWAY } from '@/modules/orders/domain/ports';

describe('ReconcileMatchingForPairUseCase', () => {
  const marketRepository = {
    findById: jest.fn(),
    findBySymbol: jest.fn(),
  };
  const orderMatchingGateway = {
    reconcileOpenOrdersForPair: jest.fn(),
  };

  let useCase: ReconcileMatchingForPairUseCase;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        ReconcileMatchingForPairUseCase,
        { provide: MARKET_REPOSITORY, useValue: marketRepository },
        { provide: ORDER_MATCHING_GATEWAY, useValue: orderMatchingGateway },
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
});
