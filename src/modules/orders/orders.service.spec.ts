import { Test, type TestingModule } from '@nestjs/testing';
import type { Order } from '@/entities/order.entity';
import { FindAllOrdersAdminQuery } from '@/modules/orders/application/queries/find-all-orders-admin.query';
import { FindOneOrderQuery } from '@/modules/orders/application/queries/find-one-order.query';
import { FindOrdersByUserQuery } from '@/modules/orders/application/queries/find-orders-by-user.query';
import { GetOrderBookQuery } from '@/modules/orders/application/queries/get-order-book.query';
import { ListOpenOrdersForPairQuery } from '@/modules/orders/application/queries/list-open-orders-for-pair.query';
import { CancelOrderUseCase } from '@/modules/orders/application/use-cases/cancel-order.use-case';
import { CreateOrderUseCase } from '@/modules/orders/application/use-cases/create-order.use-case';
import { CancelOrderCommand } from '@/modules/orders/commands/cancel-order.command';
import { CreateOrderCommand } from '@/modules/orders/commands/create-order.command';
import { OrdersService } from '@/modules/orders/orders.service';

describe('OrdersService', () => {
  let service: OrdersService;
  let createOrderUseCase: jest.Mocked<CreateOrderUseCase>;
  let cancelOrderUseCase: jest.Mocked<CancelOrderUseCase>;
  let findOneOrderQuery: jest.Mocked<FindOneOrderQuery>;
  let getOrderBookQuery: jest.Mocked<GetOrderBookQuery>;
  let findAllOrdersAdminQuery: jest.Mocked<FindAllOrdersAdminQuery>;
  let _findOrdersByUserQuery: jest.Mocked<FindOrdersByUserQuery>;
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
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: CreateOrderUseCase, useValue: { execute: jest.fn() } },
        { provide: CancelOrderUseCase, useValue: { execute: jest.fn() } },
        { provide: FindOneOrderQuery, useValue: { execute: jest.fn() } },
        { provide: GetOrderBookQuery, useValue: { execute: jest.fn() } },
        { provide: FindAllOrdersAdminQuery, useValue: { execute: jest.fn() } },
        { provide: FindOrdersByUserQuery, useValue: { execute: jest.fn() } },
        { provide: ListOpenOrdersForPairQuery, useValue: { execute: jest.fn() } },
      ],
    }).compile();

    service = module.get(OrdersService);
    createOrderUseCase = module.get(CreateOrderUseCase);
    cancelOrderUseCase = module.get(CancelOrderUseCase);
    findOneOrderQuery = module.get(FindOneOrderQuery);
    getOrderBookQuery = module.get(GetOrderBookQuery);
    findAllOrdersAdminQuery = module.get(FindAllOrdersAdminQuery);
    _findOrdersByUserQuery = module.get(FindOrdersByUserQuery);
    listOpenOrdersForPairQuery = module.get(ListOpenOrdersForPairQuery);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('delegates to CreateOrderUseCase with a CreateOrderCommand', async () => {
      const dto = {
        pairId: 'p1',
        side: 'BUY' as const,
        type: 'LIMIT' as const,
        price: '50000',
        amount: '0.01',
        idempotencyKey: 'key-1',
      };
      createOrderUseCase.execute.mockResolvedValue(mockOrder);

      const result = await service.create({ userId: 'u1', dto });

      expect(createOrderUseCase.execute).toHaveBeenCalledWith(new CreateOrderCommand('u1', dto));
      expect(result).toEqual(mockOrder);
    });
  });

  describe('cancel', () => {
    it('delegates to CancelOrderUseCase with a CancelOrderCommand', async () => {
      const cancelled = { ...mockOrder, status: 'CANCELLED' } as Order;
      cancelOrderUseCase.execute.mockResolvedValue(cancelled);

      const result = await service.cancel({ userId: 'u1', orderId: 'o1' });

      expect(cancelOrderUseCase.execute).toHaveBeenCalledWith(
        new CancelOrderCommand('u1', 'o1', undefined),
      );
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
              side: 'BUY' as const,
              type: 'LIMIT' as const,
              price: '50000',
              amount: '0.01',
              idempotencyKey: 'k1',
            },
            {
              pairId: 'p1',
              side: 'SELL' as const,
              type: 'LIMIT' as const,
              price: '51000',
              amount: '0.01',
              idempotencyKey: 'k2',
            },
          ],
        },
      };

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
      cancelOrderUseCase.execute.mockImplementation(
        async ({ orderId }) =>
          ({
            ...mockOrder,
            order_id: orderId,
            status: 'CANCELLED',
          }) as Order,
      );

      const result = await service.cancelOpenOrdersForPair('u1', 'p1');

      expect(cancelOrderUseCase.execute).toHaveBeenCalledTimes(2);
      expect(result.map((o) => o.order_id)).toEqual(['o1', 'o2']);
    });
  });

  describe('findOne', () => {
    it('delegates to FindOneOrderQuery', async () => {
      findOneOrderQuery.execute.mockResolvedValue(mockOrder);

      const result = await service.findOne('o1', 'u1');

      expect(findOneOrderQuery.execute).toHaveBeenCalledWith('o1', 'u1');
      expect(result).toEqual(mockOrder);
    });
  });

  describe('getOrderBook', () => {
    it('delegates to GetOrderBookQuery', async () => {
      const bookLevels = [{ price: '50000', remaining: '1.5', order_count: 3 }];
      getOrderBookQuery.execute.mockResolvedValue(bookLevels);

      const result = await service.getOrderBook('p1', 'BUY', 50);

      expect(getOrderBookQuery.execute).toHaveBeenCalledWith('p1', 'BUY', 50);
      expect(result).toEqual(bookLevels);
    });
  });

  describe('findAllForAdmin', () => {
    it('delegates to FindAllOrdersAdminQuery', async () => {
      const adminResult = { data: [mockOrder], total: 1, page: 1, limit: 20 };
      findAllOrdersAdminQuery.execute.mockResolvedValue(adminResult);

      const result = await service.findAllForAdmin({ page: 1, limit: 20 });

      expect(findAllOrdersAdminQuery.execute).toHaveBeenCalledWith({ page: 1, limit: 20 });
      expect(result).toEqual(adminResult);
    });
  });
});
