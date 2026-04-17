import { getQueueToken } from '@nestjs/bull';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { CacheService, RedisService } from '@/common/services';
import { MARKET_REPOSITORY } from '@/modules/markets/domain/ports';
import { EnqueueMatchUseCase } from '@/modules/matching/application/use-cases';
import { MATCHING_REPOSITORY, TRADE_AUDIT_LOG_REPOSITORY } from '@/modules/matching/domain/ports';
import { CircuitBreakerService } from '@/modules/matching/domain/services/circuit-breaker.service';
import {
  BuyQueueService,
  OrderBookService,
  SellQueueService,
} from '@/modules/matching/domain/services/orderbook';
import {
  MarketOrderStrategy,
  PriceTimePriorityStrategy,
} from '@/modules/matching/domain/services/strategies';
import {
  AuditTradeVisitor,
  MetricsTradeVisitor,
} from '@/modules/matching/infrastructure/observers';
import {
  MATCHING_QUEUE,
  MatchingQueueService,
} from '@/modules/matching/infrastructure/queue/matching-queue.service';
import { PrepareCreateOrderContextService } from '@/modules/orders/application/services/prepare-create-order-context.service';
import { CreateOrderUseCase } from '@/modules/orders/application/use-cases/create-order.use-case';
import { ORDER_REPOSITORY } from '@/modules/orders/domain/ports';
import { OrderReservePolicy } from '@/modules/orders/domain/services/order-reserve-policy.service';
import { OrderValidationService } from '@/modules/orders/domain/services/order-validation.service';
import { WALLET_REPOSITORY } from '@/modules/wallets/domain/ports';

describe('Orders -> Matching queue integration', () => {
  const orderRepository = {
    findByUserIdempotency: jest.fn(),
    createOrderViaProcedure: jest.fn(),
    findById: jest.fn(),
    findBestLimitSellPrice: jest.fn(),
  };
  const marketRepository = {
    findById: jest.fn(),
  };
  const walletRepository = {
    findByUserCurrency: jest.fn(),
  };
  const cacheService = {
    get: jest.fn(),
    set: jest.fn(),
  };
  const matchingRepository = {
    getOpenOrdersForPair: jest.fn(),
    executeTrade: jest.fn(),
    cancelIocRemainder: jest.fn(),
  };
  const tradeAuditLogRepository = {
    save: jest.fn(),
  };
  const queue = {
    add: jest.fn().mockResolvedValue({ id: 'job-1' }),
  };
  const redisClient = {
    get: jest.fn(),
    set: jest.fn(),
    eval: jest.fn(),
  };
  const redisService = {
    getClient: jest.fn().mockReturnValue(redisClient),
  };
  const configService = {
    get: jest.fn().mockReturnValue(undefined),
  };

  let useCase: CreateOrderUseCase;

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef = await Test.createTestingModule({
      providers: [
        CreateOrderUseCase,
        PrepareCreateOrderContextService,
        OrderValidationService,
        OrderReservePolicy,
        MatchingQueueService,
        EnqueueMatchUseCase,
        OrderBookService,
        BuyQueueService,
        SellQueueService,
        PriceTimePriorityStrategy,
        MarketOrderStrategy,
        AuditTradeVisitor,
        MetricsTradeVisitor,
        CircuitBreakerService,
        { provide: ORDER_REPOSITORY, useValue: orderRepository },
        { provide: MARKET_REPOSITORY, useValue: marketRepository },
        { provide: WALLET_REPOSITORY, useValue: walletRepository },
        { provide: MATCHING_REPOSITORY, useValue: matchingRepository },
        { provide: TRADE_AUDIT_LOG_REPOSITORY, useValue: tradeAuditLogRepository },
        { provide: CacheService, useValue: cacheService },
        { provide: RedisService, useValue: redisService },
        { provide: ConfigService, useValue: configService },
        { provide: getQueueToken(MATCHING_QUEUE), useValue: queue },
      ],
    }).compile();

    useCase = moduleRef.get(CreateOrderUseCase);
  });

  it('wires create-order through matching application layer into Bull queue payload', async () => {
    cacheService.get.mockResolvedValue(null);
    orderRepository.findByUserIdempotency.mockResolvedValue(null);
    marketRepository.findById.mockResolvedValue({
      pair_id: 'pair-1',
      base_currency_id: 'btc',
      quote_currency_id: 'usdt',
      maker_fee_rate: '0.001',
      taker_fee_rate: '0.002',
      min_order_amount: '0.0001',
      amount_scale: 8,
      price_scale: 2,
    });
    walletRepository.findByUserCurrency
      .mockResolvedValueOnce({ available: '100000' })
      .mockResolvedValueOnce({ available: '2' });
    orderRepository.findBestLimitSellPrice.mockResolvedValue(null);
    orderRepository.createOrderViaProcedure.mockResolvedValue({
      order_id: 'order-1',
      error_code: null,
      error_message: null,
    });
    orderRepository.findById.mockResolvedValue({
      order_id: 'order-1',
      user_id: 'user-1',
      pair_id: 'pair-1',
      side: 'BUY',
      type: 'LIMIT',
      amount: '1.5',
      filled_amount: '0.4',
      status: 'OPEN',
      price: '123.45',
      time_in_force: 'GTC',
      created_at: new Date('2026-04-17T10:00:00Z'),
      slippage_tolerance: null,
    });

    await useCase.execute({
      userId: 'user-1',
      dto: {
        pairId: 'pair-1',
        side: 'BUY',
        type: 'LIMIT',
        price: '123.45',
        amount: '1.5',
        idempotencyKey: 'idem-1',
      },
    } as any);

    expect(queue.add).toHaveBeenCalledWith(
      'match-order',
      expect.objectContaining({
        pairId: 'pair-1',
        feeCurrencyId: 'usdt',
        makerFeeRate: '0.001',
        takerFeeRate: '0.002',
        takerOrder: expect.objectContaining({
          order_id: 'order-1',
          remaining: '1.1',
          price: '123.45',
          side: 'BUY',
        }),
      }),
      expect.objectContaining({ attempts: 3, removeOnFail: false }),
    );
  });
});
