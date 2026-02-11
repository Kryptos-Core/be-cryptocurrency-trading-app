import { Test, TestingModule } from '@nestjs/testing';
import { OrderBookService } from './order-book.service';
import { OrderBookOrder } from '../interfaces';

function order(overrides: Partial<OrderBookOrder> & { order_id: number; side: 'BUY' | 'SELL' }): OrderBookOrder {
  return {
    pair_id: 1,
    user_id: 1,
    type: 'LIMIT',
    price: '100',
    amount: '1',
    filled_amount: '0',
    status: 'OPEN',
    created_at: new Date(),
    remaining: '1',
    ...overrides,
    order_id: overrides.order_id,
    side: overrides.side,
  };
}

describe('OrderBookService', () => {
  let service: OrderBookService;
  const pairId = 1;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [OrderBookService],
    }).compile();
    service = module.get(OrderBookService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('addOrder', () => {
    it('routes BUY to buy queue and SELL to sell queue', () => {
      service.addOrder(order({ order_id: 1, side: 'BUY' }));
      service.addOrder(order({ order_id: 2, side: 'SELL' }));
      expect(service.size(pairId)).toBe(2);
      expect(service.size(pairId, 'BUY')).toBe(1);
      expect(service.size(pairId, 'SELL')).toBe(1);
    });

    it('creates separate books per pairId', () => {
      service.addOrder(order({ order_id: 1, side: 'BUY', pair_id: 1 }));
      service.addOrder(order({ order_id: 2, side: 'BUY', pair_id: 2 }));
      expect(service.size(1)).toBe(1);
      expect(service.size(2)).toBe(1);
    });
  });

  describe('getBestBid / getBestAsk', () => {
    it('returns best bid (highest buy) and best ask (lowest sell)', () => {
      service.addOrder(order({ order_id: 1, side: 'BUY', price: '100' }));
      service.addOrder(order({ order_id: 2, side: 'BUY', price: '200' }));
      service.addOrder(order({ order_id: 3, side: 'SELL', price: '300' }));
      service.addOrder(order({ order_id: 4, side: 'SELL', price: '250' }));
      expect(service.getBestBid(pairId)?.order_id).toBe(2);
      expect(service.getBestAsk(pairId)?.order_id).toBe(4);
    });

    it('returns null when side empty', () => {
      expect(service.getBestBid(pairId)).toBeNull();
      expect(service.getBestAsk(pairId)).toBeNull();
    });
  });

  describe('peekBestMaker / popBestMaker', () => {
    it('peek and pop for BUY and SELL', () => {
      service.addOrder(order({ order_id: 1, side: 'BUY', price: '200' }));
      service.addOrder(order({ order_id: 2, side: 'SELL', price: '100' }));
      expect(service.peekBestMaker(pairId, 'BUY')?.order_id).toBe(1);
      expect(service.peekBestMaker(pairId, 'SELL')?.order_id).toBe(2);
      expect(service.popBestMaker(pairId, 'BUY')?.order_id).toBe(1);
      expect(service.peekBestMaker(pairId, 'BUY')).toBeNull();
      expect(service.popBestMaker(pairId, 'SELL')?.order_id).toBe(2);
    });
  });

  describe('removeOrder', () => {
    it('removes order and returns true', () => {
      service.addOrder(order({ order_id: 1, side: 'BUY' }));
      expect(service.removeOrder(pairId, 1, 'BUY')).toBe(true);
      expect(service.size(pairId)).toBe(0);
    });

    it('returns false when pair or order not found', () => {
      expect(service.removeOrder(999, 1, 'BUY')).toBe(false);
      service.addOrder(order({ order_id: 1, side: 'BUY' }));
      expect(service.removeOrder(pairId, 99, 'BUY')).toBe(false);
    });
  });

  describe('loadOrders', () => {
    it('replaces book for pair and adds orders', () => {
      service.addOrder(order({ order_id: 1, side: 'BUY' }));
      service.loadOrders(pairId, [
        order({ order_id: 10, side: 'BUY' }),
        order({ order_id: 20, side: 'SELL' }),
      ]);
      expect(service.size(pairId)).toBe(2);
      expect(service.getBestBid(pairId)?.order_id).toBe(10);
      expect(service.getBestAsk(pairId)?.order_id).toBe(20);
    });
  });

  describe('size', () => {
    it('returns total or per-side count', () => {
      service.addOrder(order({ order_id: 1, side: 'BUY' }));
      service.addOrder(order({ order_id: 2, side: 'BUY' }));
      service.addOrder(order({ order_id: 3, side: 'SELL' }));
      expect(service.size(pairId)).toBe(3);
      expect(service.size(pairId, 'BUY')).toBe(2);
      expect(service.size(pairId, 'SELL')).toBe(1);
    });
  });
});
