import {
  EventStore,
  type OrderCancelledEvent,
  type OrderPlacedEvent,
  type TradeExecutedEvent,
} from './event-store';
import { OrderBookProjection } from './order-book-projection';

describe('OrderBookProjection', () => {
  let store: EventStore;
  let projection: OrderBookProjection;
  const pairId = 'pair-1';

  beforeEach(() => {
    store = new EventStore();
    projection = new OrderBookProjection(store);
  });

  function placeBuy(orderId: string, price: string, amount: string, userId = 'u1'): void {
    store.append({
      type: 'OrderPlaced',
      timestamp: new Date(),
      pairId,
      orderId,
      userId,
      side: 'BUY',
      orderType: 'LIMIT',
      price,
      amount,
      timeInForce: 'GTC',
    } as OrderPlacedEvent);
  }

  function placeSell(orderId: string, price: string, amount: string, userId = 'u2'): void {
    store.append({
      type: 'OrderPlaced',
      timestamp: new Date(),
      pairId,
      orderId,
      userId,
      side: 'SELL',
      orderType: 'LIMIT',
      price,
      amount,
      timeInForce: 'GTC',
    } as OrderPlacedEvent);
  }

  function cancelOrder(orderId: string): void {
    store.append({
      type: 'OrderCancelled',
      timestamp: new Date(),
      pairId,
      orderId,
      reason: 'user_request',
    } as OrderCancelledEvent);
  }

  function executeTrade(
    tradeId: string,
    makerOrderId: string,
    takerOrderId: string,
    price: string,
    amount: string,
  ): void {
    store.append({
      type: 'TradeExecuted',
      timestamp: new Date(),
      pairId,
      tradeId,
      makerOrderId,
      takerOrderId,
      price,
      amount,
      makerFee: '0.000000000000000000',
      takerFee: '0.000000000000000000',
    } as TradeExecutedEvent);
  }

  // ── Build from empty ──────────────────────────────────────────────────────
  it('returns empty book when no events', () => {
    const book = projection.build(pairId);
    expect(book.bids).toEqual([]);
    expect(book.asks).toEqual([]);
    expect(book.sequence).toBe(0);
  });

  // ── OrderPlaced ───────────────────────────────────────────────────────────
  it('adds BUY order to bids', () => {
    placeBuy('o1', '100.000000000000000000', '1.000000000000000000');
    const book = projection.build(pairId);
    expect(book.bids).toHaveLength(1);
    expect(book.bids[0].orderId).toBe('o1');
    expect(book.bids[0].price).toBe('100.000000000000000000');
    expect(book.bids[0].remaining).toBe('1.000000000000000000');
  });

  it('adds SELL order to asks', () => {
    placeSell('o2', '101.000000000000000000', '2.000000000000000000');
    const book = projection.build(pairId);
    expect(book.asks).toHaveLength(1);
    expect(book.asks[0].orderId).toBe('o2');
    expect(book.asks[0].remaining).toBe('2.000000000000000000');
  });

  it('sorts bids price DESC, asks price ASC', () => {
    placeBuy('o1', '100.000000000000000000', '1.000000000000000000');
    placeBuy('o2', '102.000000000000000000', '1.000000000000000000');
    placeSell('o3', '105.000000000000000000', '1.000000000000000000');
    placeSell('o4', '103.000000000000000000', '1.000000000000000000');

    const book = projection.build(pairId);
    expect(book.bids[0].orderId).toBe('o2'); // 102 > 100
    expect(book.bids[1].orderId).toBe('o1');
    expect(book.asks[0].orderId).toBe('o4'); // 103 < 105
    expect(book.asks[1].orderId).toBe('o3');
  });

  // ── OrderCancelled ────────────────────────────────────────────────────────
  it('removes order from book when cancelled', () => {
    placeBuy('o1', '100.000000000000000000', '1.000000000000000000');
    cancelOrder('o1');
    const book = projection.build(pairId);
    expect(book.bids).toHaveLength(0);
  });

  // ── TradeExecuted ─────────────────────────────────────────────────────────
  it('reduces maker remaining on trade', () => {
    placeBuy('o1', '100.000000000000000000', '2.000000000000000000');
    placeSell('o2', '100.000000000000000000', '1.000000000000000000');
    executeTrade('t1', 'o1', 'o2', '100.000000000000000000', '1.000000000000000000');

    const book = projection.build(pairId);
    // o1 had 2, filled 1, remaining 1
    const bid = book.bids.find((b) => b.orderId === 'o1');
    expect(bid).toBeDefined();
    expect(bid?.remaining).toBe('1.000000000000000000');
    // o2 fully filled (remaining 0) → removed from book
    const ask = book.asks.find((a) => a.orderId === 'o2');
    expect(ask).toBeUndefined();
  });

  it('removes fully filled order from book', () => {
    placeBuy('o1', '100.000000000000000000', '1.000000000000000000');
    placeSell('o2', '100.000000000000000000', '1.000000000000000000');
    executeTrade('t1', 'o1', 'o2', '100.000000000000000000', '1.000000000000000000');

    const book = projection.build(pairId);
    expect(book.bids).toHaveLength(0);
    expect(book.asks).toHaveLength(0);
  });

  // ── Replay to specific sequence ───────────────────────────────────────────
  it('buildAt(pairId, sequence) replays only up to given sequence', () => {
    placeBuy('o1', '100.000000000000000000', '1.000000000000000000'); // seq 1
    placeBuy('o2', '101.000000000000000000', '1.000000000000000000'); // seq 2
    cancelOrder('o1'); // seq 3

    // At sequence 2: both orders exist
    const bookAt2 = projection.buildAt(pairId, 2);
    expect(bookAt2.bids).toHaveLength(2);
    expect(bookAt2.sequence).toBe(2);

    // At sequence 3: o1 cancelled
    const bookAt3 = projection.buildAt(pairId, 3);
    expect(bookAt3.bids).toHaveLength(1);
    expect(bookAt3.bids[0].orderId).toBe('o2');
    expect(bookAt3.sequence).toBe(3);
  });

  it('build() replays all events through last sequence', () => {
    placeBuy('o1', '100.000000000000000000', '1.000000000000000000');
    placeBuy('o2', '101.000000000000000000', '1.000000000000000000');
    cancelOrder('o1');

    const book = projection.build(pairId);
    expect(book.bids).toHaveLength(1);
    expect(book.sequence).toBe(3);
  });

  // ── Complex scenario ──────────────────────────────────────────────────────
  it('handles complex sequence: place → partial fill → cancel remainder', () => {
    placeBuy('o1', '100.000000000000000000', '5.000000000000000000');
    placeSell('o2', '100.000000000000000000', '3.000000000000000000');
    executeTrade('t1', 'o1', 'o2', '100.000000000000000000', '3.000000000000000000');
    cancelOrder('o1');

    const book = projection.build(pairId);
    // o1 partially filled then cancelled → removed
    // o2 fully filled → removed
    expect(book.bids).toHaveLength(0);
    expect(book.asks).toHaveLength(0);
  });

  it('trade reduces both maker and taker remaining', () => {
    placeBuy('o1', '100.000000000000000000', '3.000000000000000000');
    placeSell('o2', '100.000000000000000000', '5.000000000000000000');
    executeTrade('t1', 'o1', 'o2', '100.000000000000000000', '3.000000000000000000');

    const book = projection.build(pairId);
    // o1 fully filled → removed
    expect(book.bids).toHaveLength(0);
    // o2 had 5, filled 3, remaining 2
    expect(book.asks).toHaveLength(1);
    expect(book.asks[0].remaining).toBe('2.000000000000000000');
  });
});
