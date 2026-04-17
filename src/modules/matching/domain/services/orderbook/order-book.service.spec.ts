import { Test, type TestingModule } from '@nestjs/testing';
import type { OrderBookOrder } from '../../../interfaces';
import { BuyQueueService } from './buy-queue.service';
import { OrderBookService } from './order-book.service';
import { SellQueueService } from './sell-queue.service';

function order(overrides: Partial<OrderBookOrder> & { order_id: string }): OrderBookOrder {
  return {
    pair_id: 'pair-1',
    user_id: 'user-1',
    side: 'BUY',
    type: 'LIMIT',
    price: '100',
    amount: '1',
    filled_amount: '0',
    status: 'OPEN',
    created_at: new Date('2025-01-01T00:00:00.000Z'),
    remaining: '1',
    ...overrides,
    order_id: overrides.order_id,
  };
}

describe('OrderBookService', () => {
  let service: OrderBookService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [OrderBookService, BuyQueueService, SellQueueService],
    }).compile();

    service = module.get(OrderBookService);
  });

  it('adds and removes orders by pair', () => {
    service.addOrder(order({ order_id: 'b1', side: 'BUY' }));
    expect(service.peekBestMaker('pair-1', 'BUY')?.order_id).toBe('b1');
    expect(service.removeOrder('pair-1', 'b1', 'BUY')).toBe(true);
    expect(service.peekBestMaker('pair-1', 'BUY')).toBeNull();
  });
});
