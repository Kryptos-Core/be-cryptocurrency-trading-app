import { Test, type TestingModule } from '@nestjs/testing';
import { BusinessException, ForbiddenException, NotFoundException } from '../../common/exceptions';
import { CacheService } from '../../common/services';
import type { Order } from '../../entities/order.entity';
import { MarketRepository } from '../markets/repositories';
import { MatchingService } from '../matching/matching.service';
import { MatchingQueueService } from '../matching/matching-queue.service';
import { WalletRepository } from '../wallets/repositories/wallet.repository';
import { OrdersService } from './orders.service';
import { OrderRepository } from './repositories';
import { OrderValidationStrategy } from './strategies/order-validation.strategy';

describe('OrdersService', () => {
  let service: OrdersService;
  let orderRepository: jest.Mocked<OrderRepository>;
  let marketRepository: jest.Mocked<MarketRepository>;
  let walletRepository: jest.Mocked<WalletRepository>;
  let cacheService: jest.Mocked<CacheService>;
  let validationStrategy: jest.Mocked<OrderValidationStrategy>;
  let matchingService: {
    runMatch: jest.Mock;
    removeOrderFromBook: jest.Mock;
    reconcileOpenOrdersForPair: jest.Mock;
  };

  const mockOrder = {
    order_id: 'o1',
    user_id: 'u1',
    pair_id: 'p1',
    side: 'BUY' as const,
    type: 'LIMIT' as const,
    price: '50000',
    amount: '0.01',
    filled_amount: '0',
    avg_price: null,
    status: 'OPEN' as const,
    time_in_force: 'GTC' as const,
    reserved_quote: '500',
    reserved_base: '0',
    client_order_id: null,
    idempotency_key: 'key-1',
    created_at: new Date(),
    updated_at: new Date(),
  } as unknown as Order;

  beforeEach(async () => {
    const mockOrderRepo = {
      findByUserIdempotency: jest.fn(),
      findById: jest.fn(),
      createOrderViaProcedure: jest.fn(),
      cancelOrderViaProcedure: jest.fn(),
      getOrderBook: jest.fn(),
      findBestLimitSellPrice: jest.fn(),
      findByUser: jest.fn(),
      countByUser: jest.fn(),
    };
    const mockMarketRepo = {
      findById: jest.fn(),
      findBySymbol: jest.fn(),
    };
    const mockWalletRepo = {
      findByUserCurrency: jest.fn(),
    };
    const mockCache = {
      get: jest.fn(),
      set: jest.fn(),
    };
    const mockValidation = {
      validate: jest.fn(),
    };
    matchingService = {
      runMatch: jest.fn().mockResolvedValue([]),
      removeOrderFromBook: jest.fn().mockReturnValue(true),
      reconcileOpenOrdersForPair: jest.fn().mockResolvedValue({
        pairId: 'p1',
        tradesExecuted: 0,
        matchRuns: 0,
        openOrdersRemaining: 0,
        stoppedReason: 'all_matched',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: OrderRepository, useValue: mockOrderRepo },
        { provide: MarketRepository, useValue: mockMarketRepo },
        { provide: WalletRepository, useValue: mockWalletRepo },
        { provide: CacheService, useValue: mockCache },
        { provide: OrderValidationStrategy, useValue: mockValidation },
        { provide: MatchingService, useValue: matchingService },
        {
          provide: MatchingQueueService,
          useValue: { enqueueMatch: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    service = module.get(OrdersService);
    orderRepository = module.get(OrderRepository);
    marketRepository = module.get(MarketRepository);
    walletRepository = module.get(WalletRepository);
    cacheService = module.get(CacheService);
    validationStrategy = module.get(OrderValidationStrategy);

    jest.clearAllMocks();
  });

  describe('create', () => {
    const dto = {
      pairId: 'p1',
      side: 'BUY' as const,
      type: 'LIMIT' as const,
      price: '50000',
      amount: '0.01',
      timeInForce: 'GTC' as const,
      idempotencyKey: 'key-1',
    };
    const pair = {
      pair_id: 'p1',
      base_currency_id: 'b1',
      quote_currency_id: 'q1',
      min_order_amount: '0.0001',
    };
    const quoteWallet = { available: '10000', frozen: '0' };

    it('returns cached order from Redis when idempotency key hit', async () => {
      cacheService.get.mockResolvedValue({ ...mockOrder });
      const result = await service.create({ userId: 'u1', dto });
      expect(cacheService.get).toHaveBeenCalled();
      expect(orderRepository.findByUserIdempotency).not.toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(result.order_id).toBe(mockOrder.order_id);
    });

    it('returns existing order from DB when idempotency key hit', async () => {
      cacheService.get.mockResolvedValue(null);
      orderRepository.findByUserIdempotency.mockResolvedValue(mockOrder);
      const result = await service.create({ userId: 'u1', dto });
      expect(orderRepository.findByUserIdempotency).toHaveBeenCalledWith('u1', 'key-1');
      expect(orderRepository.createOrderViaProcedure).not.toHaveBeenCalled();
      expect(result).toEqual(mockOrder);
    });

    it('throws NotFoundException when pair not found', async () => {
      cacheService.get.mockResolvedValue(null);
      orderRepository.findByUserIdempotency.mockResolvedValue(null);
      marketRepository.findById.mockResolvedValue(null);
      await expect(service.create({ userId: 'u1', dto })).rejects.toThrow(NotFoundException);
      expect(orderRepository.createOrderViaProcedure).not.toHaveBeenCalled();
    });

    it('creates order and returns it on success', async () => {
      cacheService.get.mockResolvedValue(null);
      orderRepository.findByUserIdempotency.mockResolvedValue(null);
      marketRepository.findById.mockResolvedValue(pair as any);
      walletRepository.findByUserCurrency.mockResolvedValue(quoteWallet as any);
      orderRepository.createOrderViaProcedure.mockResolvedValue({
        order_id: 'o1',
        error_code: null,
        error_message: null,
      });
      orderRepository.findById.mockResolvedValue(mockOrder);
      const result = await service.create({ userId: 'u1', dto });
      expect(validationStrategy.validate).toHaveBeenCalled();
      expect(orderRepository.createOrderViaProcedure).toHaveBeenCalledWith(
        expect.objectContaining({
          slippageTolerance: null,
          marketBuyReservedQuote: null,
        }),
      );
      expect(cacheService.set).toHaveBeenCalled();
      expect(result).toEqual(mockOrder);
    });

    it('throws BusinessException when procedure returns error_code', async () => {
      cacheService.get.mockResolvedValue(null);
      orderRepository.findByUserIdempotency.mockResolvedValue(null);
      marketRepository.findById.mockResolvedValue(pair as any);
      walletRepository.findByUserCurrency.mockResolvedValue(quoteWallet as any);
      orderRepository.createOrderViaProcedure.mockResolvedValue({
        order_id: null,
        error_code: 'INSUFFICIENT_BALANCE',
        error_message: 'Insufficient quote balance',
      });
      await expect(service.create({ userId: 'u1', dto })).rejects.toThrow(BusinessException);
    });
  });

  describe('reconcileMatchingForPair', () => {
    it('throws NotFoundException when pair missing', async () => {
      marketRepository.findById.mockResolvedValue(null);
      marketRepository.findBySymbol.mockResolvedValue(null);
      await expect(service.reconcileMatchingForPair('missing-pair')).rejects.toThrow(
        NotFoundException,
      );
      expect(matchingService.reconcileOpenOrdersForPair).not.toHaveBeenCalled();
      expect(marketRepository.findBySymbol).not.toHaveBeenCalled();
    });

    it('resolves by symbol when id lookup fails and input contains slash', async () => {
      marketRepository.findById.mockResolvedValue(null);
      marketRepository.findBySymbol.mockResolvedValue({
        pair_id: 'real-pair-uuid',
        quote_currency_id: 'q1',
        maker_fee_rate: '0.001',
        taker_fee_rate: '0.002',
      } as any);
      matchingService.reconcileOpenOrdersForPair.mockResolvedValue({
        pairId: 'real-pair-uuid',
        tradesExecuted: 0,
        matchRuns: 0,
        openOrdersRemaining: 0,
        stoppedReason: 'all_matched',
      });
      await service.reconcileMatchingForPair('OG/USDT');
      expect(marketRepository.findBySymbol).toHaveBeenCalledWith('OG/USDT');
      expect(matchingService.reconcileOpenOrdersForPair).toHaveBeenCalledWith({
        pairId: 'real-pair-uuid',
        feeCurrencyId: 'q1',
        makerFeeRate: '0.001',
        takerFeeRate: '0.002',
      });
    });

    it('delegates to matching with fee fields from pair', async () => {
      marketRepository.findById.mockResolvedValue({
        pair_id: 'p1',
        quote_currency_id: 'q1',
        maker_fee_rate: '0.002',
        taker_fee_rate: '0.003',
      } as any);
      const summary = {
        pairId: 'p1',
        tradesExecuted: 2,
        matchRuns: 5,
        openOrdersRemaining: 0,
        stoppedReason: 'all_matched' as const,
      };
      matchingService.reconcileOpenOrdersForPair.mockResolvedValue(summary);
      const result = await service.reconcileMatchingForPair('p1');
      expect(matchingService.reconcileOpenOrdersForPair).toHaveBeenCalledWith({
        pairId: 'p1',
        feeCurrencyId: 'q1',
        makerFeeRate: '0.002',
        takerFeeRate: '0.003',
      });
      expect(result).toEqual(summary);
    });
  });

  describe('cancel', () => {
    it('throws NotFoundException when order not found', async () => {
      orderRepository.findById.mockResolvedValue(null);
      await expect(service.cancel({ userId: 'u1', orderId: 'o1' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ForbiddenException when order belongs to another user', async () => {
      orderRepository.findById.mockResolvedValue({ ...mockOrder, user_id: 'u2' } as Order);
      await expect(service.cancel({ userId: 'u1', orderId: 'o1' })).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws BusinessException when order cannot be cancelled (status)', async () => {
      orderRepository.findById.mockResolvedValue({ ...mockOrder, status: 'FILLED' } as Order);
      await expect(service.cancel({ userId: 'u1', orderId: 'o1' })).rejects.toThrow(
        BusinessException,
      );
    });

    it('cancels order and returns updated order', async () => {
      orderRepository.findById
        .mockResolvedValueOnce(mockOrder)
        .mockResolvedValueOnce({ ...mockOrder, status: 'CANCELLED' } as Order);
      orderRepository.cancelOrderViaProcedure.mockResolvedValue({
        cancelled: 1,
        error_code: null,
        error_message: null,
      });
      const result = await service.cancel({ userId: 'u1', orderId: 'o1' });
      expect(orderRepository.cancelOrderViaProcedure).toHaveBeenCalledWith('o1', 'u1');
      expect(matchingService.removeOrderFromBook).toHaveBeenCalledWith('p1', 'o1', 'BUY');
      expect(result.status).toBe('CANCELLED');
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException when order not found', async () => {
      orderRepository.findById.mockResolvedValue(null);
      await expect(service.findOne('o1', 'u1')).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when order belongs to another user', async () => {
      orderRepository.findById.mockResolvedValue({ ...mockOrder, user_id: 'u2' } as Order);
      await expect(service.findOne('o1', 'u1')).rejects.toThrow(ForbiddenException);
    });

    it('returns order when owner', async () => {
      orderRepository.findById.mockResolvedValue(mockOrder);
      const result = await service.findOne('o1', 'u1');
      expect(result).toEqual(mockOrder);
    });
  });

  describe('getOrderBook', () => {
    it('delegates to repository', async () => {
      const levels = [{ price: '50000', remaining: '1', order_count: 2 }];
      orderRepository.getOrderBook.mockResolvedValue(levels);
      const result = await service.getOrderBook('p1', 'BUY', 20);
      expect(orderRepository.getOrderBook).toHaveBeenCalledWith('p1', 'BUY', 20);
      expect(result).toEqual(levels);
    });
  });

  describe('findMyOrders', () => {
    it('returns paginated list and total', async () => {
      orderRepository.findByUser.mockResolvedValue([mockOrder]);
      orderRepository.countByUser.mockResolvedValue(1);
      const result = await service.findMyOrders('u1', 1, 20);
      expect(orderRepository.findByUser).toHaveBeenCalledWith('u1', null, 0, 20);
      expect(orderRepository.countByUser).toHaveBeenCalledWith('u1', null);
      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });
  });
});
