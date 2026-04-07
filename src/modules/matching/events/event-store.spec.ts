import {
  OrderBookEvent,
  OrderPlacedEvent,
  OrderCancelledEvent,
  TradeExecutedEvent,
  EventStore,
} from './event-store';

describe('EventStore', () => {
  let store: EventStore;

  beforeEach(() => {
    store = new EventStore();
  });

  // ── Append ────────────────────────────────────────────────────────────────
  it('appends OrderPlaced event and assigns incrementing sequence', () => {
    const event: OrderPlacedEvent = {
      type: 'OrderPlaced',
      timestamp: new Date('2026-01-01T00:00:00Z'),
      pairId: 'pair-1',
      orderId: 'o1',
      userId: 'u1',
      side: 'BUY',
      orderType: 'LIMIT',
      price: '100.000000000000000000',
      amount: '1.000000000000000000',
      timeInForce: 'GTC',
    };
    const seq = store.append(event);
    expect(seq).toBe(1);
  });

  it('appends multiple events with monotonically increasing sequence', () => {
    const placed: OrderPlacedEvent = {
      type: 'OrderPlaced',
      timestamp: new Date(),
      pairId: 'pair-1',
      orderId: 'o1',
      userId: 'u1',
      side: 'BUY',
      orderType: 'LIMIT',
      price: '100.000000000000000000',
      amount: '1.000000000000000000',
      timeInForce: 'GTC',
    };
    const cancelled: OrderCancelledEvent = {
      type: 'OrderCancelled',
      timestamp: new Date(),
      pairId: 'pair-1',
      orderId: 'o1',
      reason: 'user_request',
    };
    const seq1 = store.append(placed);
    const seq2 = store.append(cancelled);
    expect(seq2).toBe(seq1 + 1);
  });

  it('appends TradeExecuted event', () => {
    const trade: TradeExecutedEvent = {
      type: 'TradeExecuted',
      timestamp: new Date(),
      pairId: 'pair-1',
      tradeId: 't1',
      makerOrderId: 'o1',
      takerOrderId: 'o2',
      price: '100.000000000000000000',
      amount: '0.500000000000000000',
      makerFee: '0.050000000000000000',
      takerFee: '0.050000000000000000',
    };
    const seq = store.append(trade);
    expect(seq).toBe(1);
  });

  // ── Immutability ──────────────────────────────────────────────────────────
  it('events are immutable: getEvents returns copies', () => {
    const placed: OrderPlacedEvent = {
      type: 'OrderPlaced',
      timestamp: new Date(),
      pairId: 'pair-1',
      orderId: 'o1',
      userId: 'u1',
      side: 'BUY',
      orderType: 'LIMIT',
      price: '100.000000000000000000',
      amount: '1.000000000000000000',
      timeInForce: 'GTC',
    };
    store.append(placed);
    const events = store.getEvents('pair-1');
    // Mutating the returned array should not affect the store
    events.length = 0;
    expect(store.getEvents('pair-1')).toHaveLength(1);
  });

  // ── Query ─────────────────────────────────────────────────────────────────
  it('getEvents filters by pairId', () => {
    const e1: OrderPlacedEvent = {
      type: 'OrderPlaced',
      timestamp: new Date(),
      pairId: 'pair-1',
      orderId: 'o1',
      userId: 'u1',
      side: 'BUY',
      orderType: 'LIMIT',
      price: '100.000000000000000000',
      amount: '1.000000000000000000',
      timeInForce: 'GTC',
    };
    const e2: OrderPlacedEvent = {
      ...e1,
      pairId: 'pair-2',
      orderId: 'o2',
    };
    store.append(e1);
    store.append(e2);
    expect(store.getEvents('pair-1')).toHaveLength(1);
    expect(store.getEvents('pair-2')).toHaveLength(1);
  });

  it('getEvents with afterSequence returns only later events', () => {
    const base: OrderPlacedEvent = {
      type: 'OrderPlaced',
      timestamp: new Date(),
      pairId: 'pair-1',
      orderId: 'o1',
      userId: 'u1',
      side: 'BUY',
      orderType: 'LIMIT',
      price: '100.000000000000000000',
      amount: '1.000000000000000000',
      timeInForce: 'GTC',
    };
    store.append(base); // seq 1
    store.append({ ...base, orderId: 'o2' }); // seq 2
    store.append({ ...base, orderId: 'o3' }); // seq 3

    const afterSeq1 = store.getEvents('pair-1', 1);
    expect(afterSeq1).toHaveLength(2); // seq 2 and 3
    expect((afterSeq1[0] as OrderPlacedEvent).orderId).toBe('o2');
  });

  it('getLastSequence returns 0 when no events', () => {
    expect(store.getLastSequence('pair-1')).toBe(0);
  });

  it('getLastSequence returns highest sequence for pair', () => {
    const placed: OrderPlacedEvent = {
      type: 'OrderPlaced',
      timestamp: new Date(),
      pairId: 'pair-1',
      orderId: 'o1',
      userId: 'u1',
      side: 'BUY',
      orderType: 'LIMIT',
      price: '100.000000000000000000',
      amount: '1.000000000000000000',
      timeInForce: 'GTC',
    };
    store.append(placed);
    store.append({ ...placed, orderId: 'o2' });
    expect(store.getLastSequence('pair-1')).toBe(2);
  });
});
