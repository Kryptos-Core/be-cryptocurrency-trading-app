import { Test, TestingModule } from '@nestjs/testing';
import { OrderBookService } from './order-book.service';
import { OrderBookOrder } from '../interfaces';

function order(
  overrides: Partial<OrderBookOrder> & { order_id: string; side: 'BUY' | 'SELL' },
): OrderBookOrder {
  return {
    pair_id: 'pair-1',
    user_id: 'user-1',
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
      providers: [OrderBookService],
    }).compile();
    service = module.get(OrderBookService);
  });

  it('routes BUY/SELL and reads best bid/ask', () => {
    service.addOrder(order({ order_id: 'b1', side: 'BUY', price: '100' }));
    service.addOrder(order({ order_id: 'b2', side: 'BUY', price: '200' }));
    service.addOrder(order({ order_id: 's1', side: 'SELL', price: '300' }));
    service.addOrder(order({ order_id: 's2', side: 'SELL', price: '250' }));

    expect(service.size('pair-1')).toBe(4);
    expect(service.size('pair-1', 'BUY')).toBe(2);
    expect(service.size('pair-1', 'SELL')).toBe(2);
    expect(service.getBestBid('pair-1')?.order_id).toBe('b2');
    expect(service.getBestAsk('pair-1')?.order_id).toBe('s2');
  });

  it('upserts by order_id to avoid duplicate snapshots', () => {
    service.addOrder(
      order({
        order_id: 'dup-1',
        side: 'BUY',
        remaining: '1',
        filled_amount: '0',
      }),
    );
    service.addOrder(
      order({
        order_id: 'dup-1',
        side: 'BUY',
        remaining: '0.4',
        filled_amount: '0.6',
      }),
    );

    expect(service.size('pair-1', 'BUY')).toBe(1);
    expect(service.getBestBid('pair-1')?.remaining).toBe('0.4');
    expect(service.getBestBid('pair-1')?.filled_amount).toBe('0.6');
  });

  it('removes and pops correctly', () => {
    service.addOrder(order({ order_id: 'b1', side: 'BUY' }));
    service.addOrder(order({ order_id: 's1', side: 'SELL' }));

    expect(service.removeOrder('pair-1', 'b1', 'BUY')).toBe(true);
    expect(service.peekBestMaker('pair-1', 'BUY')).toBeNull();
    expect(service.popBestMaker('pair-1', 'SELL')?.order_id).toBe('s1');
  });

  it('replaces pair book on loadOrders', () => {
    service.addOrder(order({ order_id: 'old', side: 'BUY' }));
    service.loadOrders('pair-1', [
      order({ order_id: 'new-b', side: 'BUY' }),
      order({ order_id: 'new-s', side: 'SELL' }),
    ]);

    expect(service.size('pair-1')).toBe(2);
    expect(service.getBestBid('pair-1')?.order_id).toBe('new-b');
    expect(service.getBestAsk('pair-1')?.order_id).toBe('new-s');
  });

  it('loads into the same book when pair_id rows are CHAR-padded but lookup uses trim id', () => {
    const padded = 'pair-1      ';
    service.loadOrders('pair-1', [
      order({ order_id: 'new-b', side: 'BUY', pair_id: padded }),
      order({ order_id: 'new-s', side: 'SELL', pair_id: padded }),
    ]);

    expect(service.size('pair-1')).toBe(2);
    expect(service.peekBestMaker('pair-1', 'SELL')?.order_id).toBe('new-s');
    expect(service.peekBestMaker('pair-1', 'BUY')?.order_id).toBe('new-b');
  });

  describe('isLoaded / markLoaded (incremental book tracking)', () => {
    it('returns false for a pair that has never been loaded', () => {
      expect(service.isLoaded('pair-never')).toBe(false);
    });

    it('returns true after markLoaded is called', () => {
      service.markLoaded('pair-1');
      expect(service.isLoaded('pair-1')).toBe(true);
    });

    it('returns false again after loadOrders (full-rebuild resets the loaded flag)', () => {
      service.markLoaded('pair-1');
      expect(service.isLoaded('pair-1')).toBe(true);

      service.loadOrders('pair-1', []);
      // loadOrders wipes the book so loaded flag is reset — next match will re-seed from DB
      expect(service.isLoaded('pair-1')).toBe(false);
    });

    it('normalizePairId: padded pair id resolves to same loaded state', () => {
      service.markLoaded('pair-1');
      expect(service.isLoaded('pair-1     ')).toBe(true);
    });
  });
});
