import { Test, TestingModule } from '@nestjs/testing';
import { BuyQueueService } from './buy-queue.service';
import { OrderBookOrder } from '../interfaces';

function order(overrides: Partial<OrderBookOrder> & { order_id: number }): OrderBookOrder {
  return {
    pair_id: 1,
    user_id: 1,
    side: 'BUY',
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

describe('BuyQueueService', () => {
  let service: BuyQueueService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BuyQueueService],
    }).compile();
    service = module.get(BuyQueueService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('add', () => {
    it('adds BUY order and sorts by price DESC then time ASC', () => {
      const older = order({ order_id: 1, price: '100', created_at: new Date('2025-01-01') });
      const newer = order({ order_id: 2, price: '100', created_at: new Date('2025-01-02') });
      const higher = order({ order_id: 3, price: '200', created_at: new Date('2025-01-03') });
      service.add(older);
      service.add(newer);
      service.add(higher);
      expect(service.size()).toBe(3);
      expect(service.peekBest()?.order_id).toBe(3);
      service.popBest();
      expect(service.peekBest()?.order_id).toBe(1);
    });

    it('ignores non-BUY order', () => {
      const sellOrder = order({ order_id: 1, remaining: '1' });
      (sellOrder as OrderBookOrder).side = 'SELL';
      service.add(sellOrder);
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
      expect(service.peekBest()?.order_id).toBe(2);
    });

    it('returns false when order not found', () => {
      service.add(order({ order_id: 1 }));
      expect(service.remove(99)).toBe(false);
      expect(service.size()).toBe(1);
    });
  });

  describe('peekBest / popBest', () => {
    it('peekBest returns first without removing', () => {
      service.add(order({ order_id: 1 }));
      expect(service.peekBest()?.order_id).toBe(1);
      expect(service.size()).toBe(1);
    });

    it('popBest returns and removes first', () => {
      service.add(order({ order_id: 1 }));
      service.add(order({ order_id: 2 }));
      expect(service.popBest()?.order_id).toBe(1);
      expect(service.popBest()?.order_id).toBe(2);
      expect(service.popBest()).toBeNull();
    });

    it('peekBest returns null when empty', () => {
      expect(service.peekBest()).toBeNull();
    });
  });

  describe('size / getAll', () => {
    it('size returns count, getAll returns copy', () => {
      service.add(order({ order_id: 1 }));
      service.add(order({ order_id: 2 }));
      expect(service.size()).toBe(2);
      const all = service.getAll();
      expect(all).toHaveLength(2);
      all.pop();
      expect(service.size()).toBe(2);
    });
  });
});
