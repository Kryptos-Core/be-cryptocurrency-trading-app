import { Test, TestingModule } from '@nestjs/testing';
import { SellQueueService } from './sell-queue.service';
import { OrderBookOrder } from '../interfaces';

function order(overrides: Partial<OrderBookOrder> & { order_id: number }): OrderBookOrder {
  return {
    pair_id: 1,
    user_id: 1,
    side: 'SELL',
    type: 'LIMIT',
    price: '100',
    amount: '1',
    filled_amount: '0',
    status: 'OPEN',
    created_at: new Date(),
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

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('add', () => {
    it('adds SELL order and sorts by price ASC then time ASC', () => {
      const higher = order({ order_id: 1, price: '200', remaining: '1', created_at: new Date('2025-01-01') });
      const lower = order({ order_id: 2, price: '100', remaining: '1', created_at: new Date('2025-01-02') });
      const mid = order({ order_id: 3, price: '150', remaining: '1', created_at: new Date('2025-01-03') });
      service.add(higher);
      service.add(lower);
      service.add(mid);
      expect(service.size()).toBe(3);
      expect(service.peekBest()?.order_id).toBe(2); // lowest price first (best ask)
      service.popBest();
      expect(service.peekBest()?.order_id).toBe(3);
      service.popBest();
      expect(service.peekBest()?.order_id).toBe(1);
    });

    it('same price: oldest first', () => {
      const older = order({ order_id: 1, price: '100', created_at: new Date('2025-01-01') });
      const newer = order({ order_id: 2, price: '100', created_at: new Date('2025-01-02') });
      service.add(newer);
      service.add(older);
      expect(service.peekBest()?.order_id).toBe(1);
    });

    it('ignores non-SELL order', () => {
      service.add(order({ order_id: 1, side: 'BUY', remaining: '1' }) as OrderBookOrder);
      expect(service.size()).toBe(0);
    });

    it('ignores order with remaining <= 0', () => {
      service.add(order({ order_id: 1, remaining: '0' }));
      expect(service.size()).toBe(0);
    });
  });

  describe('remove', () => {
    it('removes order by id and returns true', () => {
      service.add(order({ order_id: 1 }));
      service.add(order({ order_id: 2 }));
      expect(service.remove(1)).toBe(true);
      expect(service.size()).toBe(1);
    });

    it('returns false when order not found', () => {
      expect(service.remove(99)).toBe(false);
    });
  });

  describe('peekBest / popBest', () => {
    it('returns null when empty', () => {
      expect(service.peekBest()).toBeNull();
      expect(service.popBest()).toBeNull();
    });

    it('popBest removes from queue', () => {
      service.add(order({ order_id: 1 }));
      service.add(order({ order_id: 2 }));
      service.popBest();
      expect(service.peekBest()?.order_id).toBe(2);
    });
  });

  describe('size / getAll', () => {
    it('getAll returns copy of orders', () => {
      service.add(order({ order_id: 1 }));
      const all = service.getAll();
      expect(all).toHaveLength(1);
      expect(all[0].order_id).toBe(1);
    });
  });
});
