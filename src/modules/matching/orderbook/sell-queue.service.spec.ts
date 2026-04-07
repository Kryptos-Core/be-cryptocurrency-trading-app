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

  it('sorts correctly for prices beyond IEEE 754 precision (> 2^53)', () => {
    const lowerPrice = order({
      order_id: 'low',
      price: '9007199254740992.5',
      created_at: new Date('2025-01-01'),
    });
    const higherPrice = order({
      order_id: 'high',
      price: '9007199254740992.6',
      created_at: new Date('2025-01-01'),
    });

    service.add(lowerPrice);
    service.add(higherPrice);

    // Best ask = lowest price = 'low'
    expect(service.peekBest()?.order_id).toBe('low');
  });

  it('sorts correctly for 18-decimal precision prices', () => {
    const o1 = order({
      order_id: 'o1',
      price: '0.000000000000000001',
      created_at: new Date('2025-01-01'),
    });
    const o2 = order({
      order_id: 'o2',
      price: '0.000000000000000002',
      created_at: new Date('2025-01-01'),
    });

    service.add(o1);
    service.add(o2);

    // Best ask = lowest price = o1
    expect(service.peekBest()?.order_id).toBe('o1');
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
