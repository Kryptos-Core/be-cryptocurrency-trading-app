import { Test, type TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@/common/exceptions';
import type { Order } from '@/entities/order.entity';
import { ListOpenOrdersForPairQuery } from '@/modules/orders/application/queries/list-open-orders-for-pair.query';
import { CancelOrderUseCase } from '@/modules/orders/application/use-cases/cancel-order.use-case';
import { CreateOrderUseCase } from '@/modules/orders/application/use-cases/create-order.use-case';
import { OrdersService } from '@/modules/orders/orders.service';
import { OrderRepository } from '@/modules/orders/repositories';

describe('OrdersService', () => {
  let service: OrdersService;
  let orderRepository: jest.Mocked<OrderRepository>;
  let createOrderUseCase: jest.Mocked<CreateOrderUseCase>;
  let cancelOrderUseCase: jest.Mocked<CancelOrderUseCase>;
  let listOpenOrdersForPairQuery: jest.Mocked<ListOpenOrdersForPairQuery>;

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
    idempotency_key: 'key-1',
    created_at: new Date(),
    updated_at: new Date(),
  } as unknown as Order;

  beforeEach(async () => {
    const mockOrderRepo = {
      findById: jest.fn(),
      getOrderBook: jest.fn(),
      findAllForAdmin: jest.fn(),
      findByUserForAdmin: jest.fn(),
    };
    const mockCreateUseCase = {
      execute: jest.fn(),
    };
    const mockCancelUseCase = {
      execute: jest.fn(),
    };
    const mockListOpenOrdersForPairQuery = {
      execute: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: OrderRepository, useValue: mockOrderRepo },
        { provide: CreateOrderUseCase, useValue: mockCreateUseCase },
        { provide: CancelOrderUseCase, useValue: mockCancelUseCase },
        { provide: ListOpenOrdersForPairQuery, useValue: mockListOpenOrdersForPairQuery },
      ],
    }).compile();

    service = module.get(OrdersService);
    orderRepository = module.get(OrderRepository);
    createOrderUseCase = module.get(CreateOrderUseCase);
    cancelOrderUseCase = module.get(CancelOrderUseCase);
    listOpenOrdersForPairQuery = module.get(ListOpenOrdersForPairQuery);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('delegates to CreateOrderUseCase', async () => {
      const command = {
        userId: 'u1',
        dto: {
          pairId: 'p1',
          side: 'BUY',
          type: 'LIMIT',
          price: '50000',
          amount: '0.01',
          idempotencyKey: 'key-1',
        },
      } as any;
      createOrderUseCase.execute.mockResolvedValue(mockOrder);

      const result = await service.create(command);

      expect(createOrderUseCase.execute).toHaveBeenCalledWith(command);
      expect(result).toEqual(mockOrder);
    });
  });

  describe('cancel', () => {
    it('delegates to CancelOrderUseCase', async () => {
      const cancelled = { ...mockOrder, status: 'CANCELLED' } as Order;
      const command = { userId: 'u1', orderId: 'o1' } as any;
      cancelOrderUseCase.execute.mockResolvedValue(cancelled);

      const result = await service.cancel(command);

      expect(cancelOrderUseCase.execute).toHaveBeenCalledWith(command);
      expect(result.status).toBe('CANCELLED');
    });
  });

  describe('createBatch', () => {
    it('creates all orders in the batch', async () => {
      createOrderUseCase.execute.mockResolvedValue(mockOrder);
      const command = {
        userId: 'u1',
        dto: {
          orders: [
            {
              pairId: 'p1',
              side: 'BUY',
              type: 'LIMIT',
              price: '50000',
              amount: '0.01',
              idempotencyKey: 'k1',
            },
            {
              pairId: 'p1',
              side: 'SELL',
              type: 'LIMIT',
              price: '51000',
              amount: '0.01',
              idempotencyKey: 'k2',
            },
          ],
        },
      } as any;

      const result = await service.createBatch(command);

      expect(createOrderUseCase.execute).toHaveBeenCalledTimes(2);
      expect(result.count).toBe(2);
      expect(result.created).toHaveLength(2);
    });
  });

  describe('listOpenOrdersForPair', () => {
    it('delegates to ListOpenOrdersForPairQuery', async () => {
      listOpenOrdersForPairQuery.execute.mockResolvedValue([mockOrder]);

      const result = await service.listOpenOrdersForPair('u1', 'p1');

      expect(listOpenOrdersForPairQuery.execute).toHaveBeenCalledWith('u1', 'p1');
      expect(result).toEqual([mockOrder]);
    });
  });

  describe('cancelOpenOrdersForPair', () => {
    it('returns empty list when no open orders', async () => {
      listOpenOrdersForPairQuery.execute.mockResolvedValue([]);

      const result = await service.cancelOpenOrdersForPair('u1', 'p1');

      expect(cancelOrderUseCase.execute).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });

    it('cancels each open order', async () => {
      listOpenOrdersForPairQuery.execute.mockResolvedValue([
        mockOrder,
        { ...mockOrder, order_id: 'o2' } as Order,
      ]);
      cancelOrderUseCase.execute.mockImplementation(async ({ orderId }) => ({
        ...mockOrder,
        order_id: orderId,
        status: 'CANCELLED',
      }) as Order);

      const result = await service.cancelOpenOrdersForPair('u1', 'p1');

      expect(cancelOrderUseCase.execute).toHaveBeenCalledTimes(2);
      expect(result.map((o) => o.order_id)).toEqual(['o1', 'o2']);
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException when order not found', async () => {
      orderRepository.findById.mockResolvedValue(null);

      await expect(service.findOne('o1', 'u1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws ForbiddenException when order belongs to another user', async () => {
      orderRepository.findById.mockResolvedValue({ ...mockOrder, user_id: 'u2' } as Order);

      await expect(service.findOne('o1', 'u1')).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
