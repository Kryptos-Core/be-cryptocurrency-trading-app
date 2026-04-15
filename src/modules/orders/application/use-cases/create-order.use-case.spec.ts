import { Test } from '@nestjs/testing';
import { CacheService } from '@/common/services';
import { BusinessException, NotFoundException } from '@/common/exceptions';
import { MatchingQueueService } from '@/modules/matching/matching-queue.service';
import { CreateOrderUseCase } from '@/modules/orders/application/use-cases/create-order.use-case';
import { PrepareCreateOrderContextService } from '@/modules/orders/application/services/prepare-create-order-context.service';
import { OrderReservePolicy } from '@/modules/orders/domain/services/order-reserve-policy.service';
import { OrderValidationService } from '@/modules/orders/domain/services/order-validation.service';
import { ORDER_REPOSITORY } from '@/modules/orders/domain/ports';

describe('CreateOrderUseCase', () => {
  const orderRepository = {
    findByUserIdempotency: jest.fn(),
    createOrderViaProcedure: jest.fn(),
    findById: jest.fn(),
    findBestLimitSellPrice: jest.fn(),
  };
  const cacheService = {
    get: jest.fn(),
    set: jest.fn(),
  };
  const validationStrategy = {
    validate: jest.fn(),
  };
  const matchingQueueService = {
    enqueueMatch: jest.fn(),
  };
  const prepareCreateOrderContextService = {
    execute: jest.fn(),
  };
  const orderReservePolicy = {
    prepare: jest.fn(),
  };

  let useCase: CreateOrderUseCase;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        CreateOrderUseCase,
        { provide: ORDER_REPOSITORY, useValue: orderRepository },
        { provide: CacheService, useValue: cacheService },
        { provide: OrderValidationService, useValue: validationStrategy },
        { provide: MatchingQueueService, useValue: matchingQueueService },
        {
          provide: PrepareCreateOrderContextService,
          useValue: prepareCreateOrderContextService,
        },
        { provide: OrderReservePolicy, useValue: orderReservePolicy },
      ],
    }).compile();

    useCase = moduleRef.get(CreateOrderUseCase);
  });

  it('returns cached order before hitting repositories', async () => {
    cacheService.get.mockResolvedValue({ order_id: 'cached-order' });

    const result = await useCase.execute({
      userId: 'u1',
      dto: { idempotencyKey: 'same-key' },
    } as any);

    expect(result.order_id).toBe('cached-order');
    expect(orderRepository.findByUserIdempotency).not.toHaveBeenCalled();
  });

  it('delegates reserve and validation policies before persistence', async () => {
    cacheService.get.mockResolvedValue(null);
    orderRepository.findByUserIdempotency.mockResolvedValue(null);
    prepareCreateOrderContextService.execute.mockResolvedValue({
      pair: {
        quote_currency_id: 'quote',
        maker_fee_rate: '0.001',
        taker_fee_rate: '0.002',
      },
      availableQuote: '1000',
      availableBase: '10',
    });
    orderReservePolicy.prepare.mockReturnValue({
      validationContext: { amount: '1' },
      slippageTolerance: null,
      marketBuyReservedQuote: null,
    });
    orderRepository.createOrderViaProcedure.mockResolvedValue({
      order_id: 'o1',
      error_code: null,
      error_message: null,
    });
    orderRepository.findById.mockResolvedValue({
      order_id: 'o1',
      user_id: 'u1',
      pair_id: 'p1',
      side: 'BUY',
      type: 'LIMIT',
      amount: '1',
      filled_amount: '0',
      status: 'OPEN',
      price: '100',
      time_in_force: 'GTC',
      created_at: new Date(),
    });

    const dto = {
      pairId: 'p1',
      side: 'BUY',
      type: 'LIMIT',
      price: '100',
      amount: '1',
      idempotencyKey: 'same-key',
    };

    const result = await useCase.execute({ userId: 'u1', dto } as any);

    expect(prepareCreateOrderContextService.execute).toHaveBeenCalledWith('u1', 'p1');
    expect(orderReservePolicy.prepare).toHaveBeenCalledWith(
      expect.objectContaining({ dto, availableQuote: '1000', availableBase: '10' }),
    );
    expect(validationStrategy.validate).toHaveBeenCalledWith({ amount: '1' });
    expect(orderRepository.createOrderViaProcedure).toHaveBeenCalled();
    expect(matchingQueueService.enqueueMatch).toHaveBeenCalled();
    expect(result.order_id).toBe('o1');
  });

  it('throws when procedure reports failure', async () => {
    cacheService.get.mockResolvedValue(null);
    orderRepository.findByUserIdempotency.mockResolvedValue(null);
    prepareCreateOrderContextService.execute.mockResolvedValue({
      pair: { quote_currency_id: 'quote' },
      availableQuote: '1000',
      availableBase: '10',
    });
    orderReservePolicy.prepare.mockReturnValue({
      validationContext: { amount: '1' },
      slippageTolerance: null,
      marketBuyReservedQuote: null,
    });
    orderRepository.createOrderViaProcedure.mockResolvedValue({
      order_id: null,
      error_code: 'INSUFFICIENT_BALANCE',
      error_message: 'Insufficient quote balance',
    });

    await expect(
      useCase.execute({
        userId: 'u1',
        dto: { pairId: 'p1', side: 'BUY', type: 'LIMIT', price: '100', amount: '1', idempotencyKey: 'same-key' },
      } as any),
    ).rejects.toBeInstanceOf(BusinessException);
  });

  it('throws when created order cannot be loaded', async () => {
    cacheService.get.mockResolvedValue(null);
    orderRepository.findByUserIdempotency.mockResolvedValue(null);
    prepareCreateOrderContextService.execute.mockResolvedValue({
      pair: { quote_currency_id: 'quote' },
      availableQuote: '1000',
      availableBase: '10',
    });
    orderReservePolicy.prepare.mockReturnValue({
      validationContext: { amount: '1' },
      slippageTolerance: null,
      marketBuyReservedQuote: null,
    });
    orderRepository.createOrderViaProcedure.mockResolvedValue({
      order_id: 'o1',
      error_code: null,
      error_message: null,
    });
    orderRepository.findById.mockResolvedValue(null);

    await expect(
      useCase.execute({
        userId: 'u1',
        dto: { pairId: 'p1', side: 'BUY', type: 'LIMIT', price: '100', amount: '1', idempotencyKey: 'same-key' },
      } as any),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
