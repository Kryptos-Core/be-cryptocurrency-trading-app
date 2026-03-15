import { Test, TestingModule } from '@nestjs/testing';
import { BuyQueueService } from './buy-queue.service';
import { OrderBookOrder } from '../interfaces';

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

describe('BuyQueueService', () => {
  let service: BuyQueueService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BuyQueueService],
    }).compile();
    service = module.get(BuyQueueService);
  });

  it('adds BUY orders and sorts by price DESC then time ASC', () => {
    const older = order({ order_id: 'o1', price: '100', created_at: new Date('2025-01-01') });
    const newer = order({ order_id: 'o2', price: '100', created_at: new Date('2025-01-02') });
    const higher = order({ order_id: 'o3', price: '200', created_at: new Date('2025-01-03') });

    service.add(older);
    service.add(newer);
    service.add(higher);

    expect(service.size()).toBe(3);
    expect(service.peekBest()?.order_id).toBe('o3');
    service.popBest();
    expect(service.peekBest()?.order_id).toBe('o1');
  });

  it('ignores non-BUY and remaining <= 0', () => {
    service.add(order({ order_id: 'sell', side: 'SELL' }));
    service.add(order({ order_id: 'zero', remaining: '0' }));
    expect(service.size()).toBe(0);
  });

  it('remove, peek, pop and getAll work as expected', () => {
    service.add(order({ order_id: 'o1' }));
    service.add(order({ order_id: 'o2' }));

    expect(service.remove('o1')).toBe(true);
    expect(service.peekBest()?.order_id).toBe('o2');
    expect(service.popBest()?.order_id).toBe('o2');
    expect(service.popBest()).toBeNull();

    service.add(order({ order_id: 'o3' }));
    const all = service.getAll();
    all.pop();
    expect(service.size()).toBe(1);
  });
});
