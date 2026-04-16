import { DomainEvent } from './base.event';
import { OrderCancelledEvent, OrderPlacedEvent, TradeExecutedEvent } from './domain-event.types';

describe('DomainEvent', () => {
  it('should generate a unique eventId on construction', () => {
    const event = new OrderPlacedEvent('order-1', 'user-1', 'BTC/USDT', 'BUY', '50000', '1');

    expect(event.eventId).toBeDefined();
    expect(typeof event.eventId).toBe('string');
    expect(event.eventId.length).toBeGreaterThan(0);
  });

  it('should set occurredOn to current date on construction', () => {
    const before = new Date();
    const event = new OrderPlacedEvent('order-1', 'user-1', 'BTC/USDT', 'BUY', '50000', '1');
    const after = new Date();

    expect(event.occurredOn.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(event.occurredOn.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it('should generate sequential eventIds across multiple events', () => {
    const event1 = new OrderPlacedEvent('o1', 'u1', 'BTC/USDT', 'BUY', '50000', '1');
    const event2 = new OrderCancelledEvent('o1', 'u1', 'user_requested');
    const event3 = new TradeExecutedEvent('t1', 'BTC/USDT', 'o1', 'o2', '50000', '1', 'u1', 'u2');

    // Event IDs should be unique
    expect(event1.eventId).not.toBe(event2.eventId);
    expect(event2.eventId).not.toBe(event3.eventId);
    expect(event1.eventId).not.toBe(event3.eventId);
  });

  it('should store all constructor properties', () => {
    const event = new TradeExecutedEvent(
      'trade-99',
      'BTC/USDT',
      'maker-123',
      'taker-456',
      '50000',
      '1.5',
      'user-maker',
      'user-taker',
    );

    expect(event.tradeId).toBe('trade-99');
    expect(event.pairId).toBe('BTC/USDT');
    expect(event.makerOrderId).toBe('maker-123');
    expect(event.takerOrderId).toBe('taker-456');
    expect(event.price).toBe('50000');
    expect(event.amount).toBe('1.5');
    expect(event.makerUserId).toBe('user-maker');
    expect(event.takerUserId).toBe('user-taker');
  });

  it('should be an instance of DomainEvent', () => {
    const event = new OrderPlacedEvent('order-1', 'user-1', 'BTC/USDT', 'BUY', '50000', '1');
    expect(event).toBeInstanceOf(DomainEvent);
  });

  it('should be an instance of DomainEvent', () => {
    const event = new OrderPlacedEvent('order-1', 'user-1', 'BTC/USDT', 'BUY', '50000', '1');
    expect(event).toBeInstanceOf(DomainEvent);
  });

  it('should have eventType on concrete event classes', () => {
    const orderEvent = new OrderPlacedEvent('o1', 'u1', 'BTC/USDT', 'BUY', '50000', '1');
    const cancelEvent = new OrderCancelledEvent('o1', 'u1', 'reason');
    const tradeEvent = new TradeExecutedEvent(
      't1',
      'BTC/USDT',
      'o1',
      'o2',
      '50000',
      '1',
      'u1',
      'u2',
    );

    expect(orderEvent.eventType).toBe('OrderPlaced');
    expect(cancelEvent.eventType).toBe('OrderCancelled');
    expect(tradeEvent.eventType).toBe('TradeExecuted');
  });
});
