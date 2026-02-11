import { Test, TestingModule } from '@nestjs/testing';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { Order } from '../../entities/order.entity';

describe('OrdersController', () => {
  let controller: OrdersController;
  let ordersService: jest.Mocked<OrdersService>;

  const mockOrder = {
    order_id: 1,
    user_id: 1,
    pair_id: 1,
    side: 'BUY',
    type: 'LIMIT',
    price: '50000',
    amount: '0.01',
    filled_amount: '0',
    status: 'OPEN',
    time_in_force: 'GTC',
    reserved_quote: '500',
    reserved_base: '0',
    idempotency_key: 'key-1',
    created_at: new Date(),
    updated_at: new Date(),
  } as unknown as Order;

  beforeEach(async () => {
    const mockService = {
      create: jest.fn(),
      cancel: jest.fn(),
      findOne: jest.fn(),
      getOrderBook: jest.fn(),
      findMyOrders: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrdersController],
      providers: [
        { provide: OrdersService, useValue: mockService },
      ],
    }).compile();

    controller = module.get(OrdersController);
    ordersService = module.get(OrdersService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('calls service.create with userId and dto', async () => {
      const dto = {
        pairId: 1,
        side: 'BUY' as const,
        type: 'LIMIT' as const,
        price: '50000',
        amount: '0.01',
        idempotencyKey: 'key-1',
      };
      ordersService.create.mockResolvedValue(mockOrder);
      const result = await controller.create(1, dto);
      expect(ordersService.create).toHaveBeenCalledWith({ userId: 1, dto });
      expect(result).toEqual(mockOrder);
    });
  });

  describe('getOrderBook', () => {
    it('calls service.getOrderBook with pairId, side, limit', async () => {
      const levels = [{ price: '50000', remaining: '1', order_count: 2 }];
      ordersService.getOrderBook.mockResolvedValue(levels);
      const result = await controller.getOrderBook(1, 'BUY', 50);
      expect(ordersService.getOrderBook).toHaveBeenCalledWith(1, 'BUY', 50);
      expect(result).toEqual(levels);
    });
  });

  describe('findMyOrders', () => {
    it('calls service.findMyOrders with userId, page, limit, status', async () => {
      const payload = { data: [mockOrder], total: 1, page: 1, limit: 20 };
      ordersService.findMyOrders.mockResolvedValue(payload);
      const result = await controller.findMyOrders(1, 1, 20, 'OPEN');
      expect(ordersService.findMyOrders).toHaveBeenCalledWith(1, 1, 20, 'OPEN');
      expect(result).toEqual(payload);
    });
  });

  describe('findOne', () => {
    it('calls service.findOne with orderId and userId', async () => {
      ordersService.findOne.mockResolvedValue(mockOrder);
      const result = await controller.findOne(1, 1);
      expect(ordersService.findOne).toHaveBeenCalledWith(1, 1);
      expect(result).toEqual(mockOrder);
    });
  });

  describe('cancel', () => {
    it('calls service.cancel with userId, orderId, and optional idempotencyKey', async () => {
      const cancelled = { ...mockOrder, status: 'CANCELLED' };
      ordersService.cancel.mockResolvedValue(cancelled as Order);
      const result = await controller.cancel(1, 1, {});
      expect(ordersService.cancel).toHaveBeenCalledWith({
        userId: 1,
        orderId: 1,
        idempotencyKey: undefined,
      });
      expect(result.status).toBe('CANCELLED');
    });
  });
});
