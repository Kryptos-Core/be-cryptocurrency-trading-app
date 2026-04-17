import type { TradeExecutionResult } from '../interfaces';
import { EventStore, type TradeExecutedEvent } from './event-store';
import { EventStoreVisitor } from './event-store-visitor';

describe('EventStoreVisitor', () => {
  let store: EventStore;
  let visitor: EventStoreVisitor;

  beforeEach(() => {
    store = new EventStore();
    visitor = new EventStoreVisitor(store);
  });

  it('appends TradeExecuted event on visit()', () => {
    const trade: TradeExecutionResult = {
      trade_id: 't1',
      pair_id: 'pair-1',
      maker_order_id: 'o1',
      taker_order_id: 'o2',
      price: '100.000000000000000000',
      amount: '1.000000000000000000',
      taker_fee: '0.001000000000000000',
      maker_fee: '0.001000000000000000',
      fee_currency_id: 'usdt',
      created_at: new Date('2026-01-01T00:00:00Z'),
    };
    visitor.visit(trade);

    const events = store.getEvents('pair-1');
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('TradeExecuted');
    const te = events[0] as TradeExecutedEvent;
    expect(te.tradeId).toBe('t1');
    expect(te.makerOrderId).toBe('o1');
    expect(te.takerOrderId).toBe('o2');
    expect(te.price).toBe('100.000000000000000000');
    expect(te.amount).toBe('1.000000000000000000');
  });

  it('handles multiple trades for same pair', () => {
    const trade1: TradeExecutionResult = {
      trade_id: 't1',
      pair_id: 'pair-1',
      maker_order_id: 'o1',
      taker_order_id: 'o2',
      price: '100.000000000000000000',
      amount: '1.000000000000000000',
      taker_fee: '0',
      maker_fee: '0',
      fee_currency_id: 'usdt',
      created_at: new Date(),
    };
    const trade2: TradeExecutionResult = {
      ...trade1,
      trade_id: 't2',
      amount: '0.500000000000000000',
    };
    visitor.visit(trade1);
    visitor.visit(trade2);

    expect(store.getEvents('pair-1')).toHaveLength(2);
  });

  it('does not throw on visit (fire-and-forget for matching pipeline)', () => {
    const trade: TradeExecutionResult = {
      trade_id: 't1',
      pair_id: 'pair-1',
      maker_order_id: 'o1',
      taker_order_id: 'o2',
      price: '100.000000000000000000',
      amount: '1.000000000000000000',
      taker_fee: '0',
      maker_fee: '0',
      fee_currency_id: 'usdt',
      created_at: new Date(),
    };
    // Should not throw
    expect(() => visitor.visit(trade)).not.toThrow();
  });
});
