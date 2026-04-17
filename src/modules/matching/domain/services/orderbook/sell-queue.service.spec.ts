import { Test, type TestingModule } from '@nestjs/testing';
import type { OrderBookOrder } from '../../../interfaces';
import { SellQueueService } from './sell-queue.service';

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

  it('sorts by best ask then oldest time', () => {
    service.add(order({ order_id: 'o1', price: '101', created_at: new Date('2025-01-01T00:00:02Z') }));
    service.add(order({ order_id: 'o2', price: '100', created_at: new Date('2025-01-01T00:00:03Z') }));
    service.add(order({ order_id: 'o3', price: '100', created_at: new Date('2025-01-01T00:00:01Z') }));

    expect(service.popBest()?.order_id).toBe('o3');
    expect(service.popBest()?.order_id).toBe('o2');
    expect(service.popBest()?.order_id).toBe('o1');
  });
});
