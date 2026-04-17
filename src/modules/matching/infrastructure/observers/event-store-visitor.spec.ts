import type { TradeExecutionResult } from '../../interfaces';
import { EventStore, type TradeExecutedEvent } from '../projections/event-store';
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
      amount: '1.500000000000000000',
      taker_fee: '0.001000000000000000',
      maker_fee: '0.001000000000000000',
      fee_currency_id: 'USDT',
      created_at: new Date('2025-01-01T00:00:00.000Z'),
    };

    visitor.visit(trade);

    const events = store.readAll();
    expect(events).toHaveLength(1);
    const event = events[0] as TradeExecutedEvent;
    expect(event.type).toBe('TradeExecuted');
    expect(event.tradeId).toBe('t1');
  });
});
