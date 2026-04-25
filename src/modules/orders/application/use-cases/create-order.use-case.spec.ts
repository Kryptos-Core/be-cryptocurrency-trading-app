import { Test } from '@nestjs/testing';
import { BusinessException, NotFoundException } from '@/common/exceptions';
import { OutboxAppender } from '@/common/outbox/outbox-appender.service';
import { CacheService } from '@/common/services';
import { PrepareCreateOrderContextService } from '@/modules/orders/application/services/prepare-create-order-context.service';
import { CreateOrderUseCase } from '@/modules/orders/application/use-cases/create-order.use-case';
import { ORDER_MATCHING_GATEWAY, ORDER_REPOSITORY } from '@/modules/orders/domain/ports';
import { OrderReservePolicy } from '@/modules/orders/domain/services/order-reserve-policy.service';
import { OrderValidationService } from '@/modules/orders/domain/services/order-validation.service';

describe('CreateOrderUseCase', () => {
  const orderRepository = {
    findByUserIdempotency: jest.fn(),
    createOrderViaProcedure: jest.fn(),
    findById: jest.fn(),
    findBestLimitSellPrice: jest.fn(),
    transaction: jest.fn(async (work) => work({})),
  };
  const cacheService = {
    get: jest.fn(),
    set: jest.fn(),
  };
  const validationStrategy = {
    validate: jest.fn(),
  };
  const orderMatchingGateway = {
    enqueueMatch: jest.fn(),
  };
  const prepareCreateOrderContextService = {
    execute: jest.fn(),
  };
  const orderReservePolicy = {
    prepare: jest.fn(),
  };
  const outboxAppender = {
    append: jest.fn(),
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
        { provide: ORDER_MATCHING_GATEWAY, useValue: orderMatchingGateway },
        {
          provide: PrepareCreateOrderContextService,
          useValue: prepareCreateOrderContextService,
        },
        { provide: OrderReservePolicy, useValue: orderReservePolicy },
        { provide: OutboxAppender, useValue: outboxAppender },
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

  it('delegates reserve and validation policies before persistence and appends outbox event', async () => {
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
      reserved_quote: '100',
      reserved_base: '0',
      client_order_id: null,
      idempotency_key: 'same-key',
      slippage_tolerance: null,
      created_at: new Date('2026-04-25T00:00:00.000Z'),
      updated_at: new Date('2026-04-25T00:00:00.000Z'),
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
    expect(orderMatchingGateway.enqueueMatch).toHaveBeenCalledWith(
      expect.objectContaining({
        pairId: 'p1',
        feeCurrencyId: 'quote',
        makerFeeRate: '0.001',
        takerFeeRate: '0.002',
      }),
    );
    expect(orderRepository.transaction).toHaveBeenCalledTimes(1);
    expect(outboxAppender.append).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        aggregateType: 'order',
        aggregateId: 'o1',
        eventType: 'order.created',
        kafkaTopic: 'orders.lifecycle',
      }),
    );
    expect(result.order_id).toBe('o1');
  });

  it('appends order.rejected event before throwing when procedure reports failure', async () => {
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
        dto: {
          pairId: 'p1',
          side: 'BUY',
          type: 'LIMIT',
          price: '100',
          amount: '1',
          idempotencyKey: 'same-key',
        },
      } as any),
    ).rejects.toBeInstanceOf(BusinessException);

    expect(orderRepository.transaction).toHaveBeenCalledTimes(1);
    expect(outboxAppender.append).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        aggregateType: 'order',
        eventType: 'order.rejected',
        kafkaTopic: 'orders.lifecycle',
      }),
    );
  });

  it('does not enqueue matching when created order is already filled', async () => {
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
      order_id: 'o-filled',
      error_code: null,
      error_message: null,
    });
    orderRepository.findById.mockResolvedValue({
      order_id: 'o-filled',
      user_id: 'u1',
      pair_id: 'p1',
      side: 'BUY',
      type: 'LIMIT',
      amount: '1',
      filled_amount: '1',
      status: 'FILLED',
      price: '100',
      time_in_force: 'GTC',
      reserved_quote: '0',
      reserved_base: '0',
      client_order_id: null,
      idempotency_key: 'filled-key',
      slippage_tolerance: null,
      created_at: new Date(),
      updated_at: new Date(),
    });

    await useCase.execute({
      userId: 'u1',
      dto: {
        pairId: 'p1',
        side: 'BUY',
        type: 'LIMIT',
        price: '100',
        amount: '1',
        idempotencyKey: 'filled-key',
      },
    } as any);

    expect(orderMatchingGateway.enqueueMatch).not.toHaveBeenCalled();
    expect(outboxAppender.append).toHaveBeenCalledTimes(1);
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
        dto: {
          pairId: 'p1',
          side: 'BUY',
          type: 'LIMIT',
          price: '100',
          amount: '1',
          idempotencyKey: 'same-key',
        },
      } as any),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
