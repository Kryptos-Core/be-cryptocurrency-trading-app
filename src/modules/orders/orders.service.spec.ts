import { Test, TestingModule } from '@nestjs/testing';
import { OrdersService } from './orders.service';
import { OrderRepository } from './repositories';
import { OrderValidationStrategy } from './strategies/order-validation.strategy';
import { CacheService } from '../../common/services';
import { MarketRepository } from '../markets/repositories';
import { WalletRepository } from '../wallets/repositories/wallet.repository';
import { Order } from '../../entities/order.entity';
import { NotFoundException, BusinessException, ForbiddenException } from '../../common/exceptions';

describe('OrdersService', () => {
  let service: OrdersService;
  let orderRepository: jest.Mocked<OrderRepository>;
  let marketRepository: jest.Mocked<MarketRepository>;
  let walletRepository: jest.Mocked<WalletRepository>;
  let cacheService: jest.Mocked<CacheService>;
  let validationStrategy: jest.Mocked<OrderValidationStrategy>;

  const mockOrder = {
    order_id: 1,
    user_id: 1,
    pair_id: 1,
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
      findByUser: jest.fn(),
      countByUser: jest.fn(),
    };
    const mockMarketRepo = {
      findById: jest.fn(),
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: OrderRepository, useValue: mockOrderRepo },
        { provide: MarketRepository, useValue: mockMarketRepo },
        { provide: WalletRepository, useValue: mockWalletRepo },
        { provide: CacheService, useValue: mockCache },
        { provide: OrderValidationStrategy, useValue: mockValidation },
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
      pairId: 1,
      side: 'BUY' as const,
      type: 'LIMIT' as const,
      price: '50000',
      amount: '0.01',
      timeInForce: 'GTC' as const,
      idempotencyKey: 'key-1',
    };
    const pair = {
      pair_id: 1,
      base_currency_id: 1,
      quote_currency_id: 2,
      min_order_amount: '0.0001',
    };
    const quoteWallet = { available: '10000', frozen: '0' };

    it('returns cached order from Redis when idempotency key hit', async () => {
      cacheService.get.mockResolvedValue({ ...mockOrder });
      const result = await service.create({ userId: 1, dto });
      expect(cacheService.get).toHaveBeenCalled();
      expect(orderRepository.findByUserIdempotency).not.toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(result.order_id).toBe(mockOrder.order_id);
    });

    it('returns existing order from DB when idempotency key hit', async () => {
      cacheService.get.mockResolvedValue(null);
      orderRepository.findByUserIdempotency.mockResolvedValue(mockOrder);
      const result = await service.create({ userId: 1, dto });
      expect(orderRepository.findByUserIdempotency).toHaveBeenCalledWith(1, 'key-1');
      expect(orderRepository.createOrderViaProcedure).not.toHaveBeenCalled();
      expect(result).toEqual(mockOrder);
    });

    it('throws NotFoundException when pair not found', async () => {
      cacheService.get.mockResolvedValue(null);
      orderRepository.findByUserIdempotency.mockResolvedValue(null);
      marketRepository.findById.mockResolvedValue(null);
      await expect(service.create({ userId: 1, dto })).rejects.toThrow(NotFoundException);
      expect(orderRepository.createOrderViaProcedure).not.toHaveBeenCalled();
    });

    it('creates order and returns it on success', async () => {
      cacheService.get.mockResolvedValue(null);
      orderRepository.findByUserIdempotency.mockResolvedValue(null);
      marketRepository.findById.mockResolvedValue(pair as any);
      walletRepository.findByUserCurrency.mockResolvedValue(quoteWallet as any);
      orderRepository.createOrderViaProcedure.mockResolvedValue({
        order_id: 1,
        error_code: null,
        error_message: null,
      });
      orderRepository.findById.mockResolvedValue(mockOrder);
      const result = await service.create({ userId: 1, dto });
      expect(validationStrategy.validate).toHaveBeenCalled();
      expect(orderRepository.createOrderViaProcedure).toHaveBeenCalled();
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
      await expect(service.create({ userId: 1, dto })).rejects.toThrow(BusinessException);
    });
  });

  describe('cancel', () => {
    it('throws NotFoundException when order not found', async () => {
      orderRepository.findById.mockResolvedValue(null);
      await expect(
        service.cancel({ userId: 1, orderId: 1 }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when order belongs to another user', async () => {
      orderRepository.findById.mockResolvedValue({ ...mockOrder, user_id: 2 } as Order);
      await expect(
        service.cancel({ userId: 1, orderId: 1 }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws BusinessException when order cannot be cancelled (status)', async () => {
      orderRepository.findById.mockResolvedValue({ ...mockOrder, status: 'FILLED' } as Order);
      await expect(
        service.cancel({ userId: 1, orderId: 1 }),
      ).rejects.toThrow(BusinessException);
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
      const result = await service.cancel({ userId: 1, orderId: 1 });
      expect(orderRepository.cancelOrderViaProcedure).toHaveBeenCalledWith(1, 1);
      expect(result.status).toBe('CANCELLED');
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException when order not found', async () => {
      orderRepository.findById.mockResolvedValue(null);
      await expect(service.findOne(1, 1)).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when order belongs to another user', async () => {
      orderRepository.findById.mockResolvedValue({ ...mockOrder, user_id: 2 } as Order);
      await expect(service.findOne(1, 1)).rejects.toThrow(ForbiddenException);
    });

    it('returns order when owner', async () => {
      orderRepository.findById.mockResolvedValue(mockOrder);
      const result = await service.findOne(1, 1);
      expect(result).toEqual(mockOrder);
    });
  });

  describe('getOrderBook', () => {
    it('delegates to repository', async () => {
      const levels = [{ price: '50000', remaining: '1', order_count: 2 }];
      orderRepository.getOrderBook.mockResolvedValue(levels);
      const result = await service.getOrderBook(1, 'BUY', 20);
      expect(orderRepository.getOrderBook).toHaveBeenCalledWith(1, 'BUY', 20);
      expect(result).toEqual(levels);
    });
  });

  describe('findMyOrders', () => {
    it('returns paginated list and total', async () => {
      orderRepository.findByUser.mockResolvedValue([mockOrder]);
      orderRepository.countByUser.mockResolvedValue(1);
      const result = await service.findMyOrders(1, 1, 20);
      expect(orderRepository.findByUser).toHaveBeenCalledWith(1, null, 0, 20);
      expect(orderRepository.countByUser).toHaveBeenCalledWith(1, null);
      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });
  });
});
