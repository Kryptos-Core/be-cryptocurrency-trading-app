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

  // ── getSnapshot (Transparent Price Discovery) ─────────────────────────────
  describe('getSnapshot', () => {
    it('returns empty snapshot when no orders', () => {
      const snap = service.getSnapshot('pair-1', 5);
      expect(snap.bids).toEqual([]);
      expect(snap.asks).toEqual([]);
      expect(snap.timestamp).toBeDefined();
    });

    it('aggregates orders at same price level', () => {
      service.addOrder(order({ order_id: 'b1', side: 'BUY', price: '100', remaining: '1' }));
      service.addOrder(order({ order_id: 'b2', side: 'BUY', price: '100', remaining: '2' }));
      service.addOrder(order({ order_id: 'b3', side: 'BUY', price: '100', remaining: '3' }));

      const snap = service.getSnapshot('pair-1', 5);
      expect(snap.bids).toHaveLength(1);
      expect(snap.bids[0].price).toBe('100');
      expect(snap.bids[0].amount).toBe('6.000000000000000000');
      expect(snap.bids[0].orderCount).toBe(3);
    });

    it('limits depth to requested number of levels', () => {
      // Create 7 distinct bid levels
      for (let i = 1; i <= 7; i++) {
        service.addOrder(
          order({
            order_id: `b${i}`,
            side: 'BUY',
            price: String(100 + i),
            remaining: '1',
          }),
        );
      }
      const snap = service.getSnapshot('pair-1', 5);
      expect(snap.bids).toHaveLength(5);
      // Best bid (highest price) should be first
      expect(snap.bids[0].price).toBe('107');
    });

    it('sorts bids price DESC, asks price ASC', () => {
      service.addOrder(order({ order_id: 'b1', side: 'BUY', price: '99', remaining: '1' }));
      service.addOrder(order({ order_id: 'b2', side: 'BUY', price: '101', remaining: '1' }));
      service.addOrder(order({ order_id: 's1', side: 'SELL', price: '105', remaining: '1' }));
      service.addOrder(order({ order_id: 's2', side: 'SELL', price: '103', remaining: '1' }));

      const snap = service.getSnapshot('pair-1', 20);
      expect(snap.bids[0].price).toBe('101');
      expect(snap.bids[1].price).toBe('99');
      expect(snap.asks[0].price).toBe('103');
      expect(snap.asks[1].price).toBe('105');
    });

    it('uses BigInt aggregation: no floating-point error', () => {
      service.addOrder(
        order({ order_id: 'b1', side: 'BUY', price: '100', remaining: '0.1' }),
      );
      service.addOrder(
        order({ order_id: 'b2', side: 'BUY', price: '100', remaining: '0.2' }),
      );
      service.addOrder(
        order({ order_id: 'b3', side: 'BUY', price: '100', remaining: '0.1' }),
      );

      const snap = service.getSnapshot('pair-1', 5);
      // 0.1 + 0.2 + 0.1 = 0.4 exactly (parseFloat would give 0.30000000000000004 + 0.1)
      expect(snap.bids[0].amount).toBe('0.400000000000000000');
    });

    it('excludes MARKET orders (null price) from snapshot', () => {
      service.addOrder(
        order({ order_id: 'b1', side: 'BUY', price: null, remaining: '1', type: 'MARKET' }),
      );
      service.addOrder(
        order({ order_id: 'b2', side: 'BUY', price: '100', remaining: '1' }),
      );

      const snap = service.getSnapshot('pair-1', 5);
      expect(snap.bids).toHaveLength(1);
      expect(snap.bids[0].price).toBe('100');
    });

    it('returns both sides in one call', () => {
      service.addOrder(order({ order_id: 'b1', side: 'BUY', price: '100', remaining: '1' }));
      service.addOrder(order({ order_id: 's1', side: 'SELL', price: '101', remaining: '2' }));

      const snap = service.getSnapshot('pair-1', 10);
      expect(snap.bids).toHaveLength(1);
      expect(snap.asks).toHaveLength(1);
    });

    it('depth=10 and depth=20 work', () => {
      for (let i = 1; i <= 12; i++) {
        service.addOrder(
          order({ order_id: `s${i}`, side: 'SELL', price: String(100 + i), remaining: '1' }),
        );
      }
      expect(service.getSnapshot('pair-1', 10).asks).toHaveLength(10);
      expect(service.getSnapshot('pair-1', 20).asks).toHaveLength(12);
    });
  });
});
