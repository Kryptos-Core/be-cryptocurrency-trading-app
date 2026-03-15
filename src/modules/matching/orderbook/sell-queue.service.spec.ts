import { Test, TestingModule } from '@nestjs/testing';
import { SellQueueService } from './sell-queue.service';
import { OrderBookOrder } from '../interfaces';

function order(overrides: Partial<OrderBookOrder> & { order_id: string }): OrderBookOrder {
  return {
    pair_id: 'pair-1',
    user_id: 'user-1',
    side: 'SELL',
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

describe('SellQueueService', () => {
  let service: SellQueueService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SellQueueService],
    }).compile();
    service = module.get(SellQueueService);
  });

  it('adds SELL orders and sorts by price ASC then time ASC', () => {
    const higher = order({ order_id: 'o1', price: '200', created_at: new Date('2025-01-01') });
    const lower = order({ order_id: 'o2', price: '100', created_at: new Date('2025-01-02') });
    const mid = order({ order_id: 'o3', price: '150', created_at: new Date('2025-01-03') });

    service.add(higher);
    service.add(lower);
    service.add(mid);

    expect(service.peekBest()?.order_id).toBe('o2');
    service.popBest();
    expect(service.peekBest()?.order_id).toBe('o3');
  });

  it('ignores non-SELL and remaining <= 0', () => {
    service.add(order({ order_id: 'buy', side: 'BUY' }));
    service.add(order({ order_id: 'zero', remaining: '0' }));
    expect(service.size()).toBe(0);
  });

  it('remove, peek, pop and getAll work as expected', () => {
    service.add(order({ order_id: 'o1' }));
    service.add(order({ order_id: 'o2' }));

    expect(service.remove('o1')).toBe(true);
    expect(service.peekBest()?.order_id).toBe('o2');
    expect(service.remove('missing')).toBe(false);

    const all = service.getAll();
    expect(all[0].order_id).toBe('o2');
  });
});
