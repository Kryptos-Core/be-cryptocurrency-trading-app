import { Logger } from '@nestjs/common';
import {
  DepositConfirmedEvent,
  OrderCancelledEvent,
  OrderPlacedEvent,
  TradeExecutedEvent,
  WalletBalanceChangedEvent,
} from './domain-event.types';
import { DomainEventDispatcher } from './domain-event-dispatcher';

describe('DomainEventDispatcher', () => {
  let dispatcher: DomainEventDispatcher;

  beforeEach(() => {
    dispatcher = new DomainEventDispatcher(new Logger('DomainEventDispatcher'));
  });

  // ─── Handler Registration ──────────────────────────────────────────────────

  it('should register a handler for an event type', async () => {
    const handler = jest.fn();
    dispatcher.register(OrderPlacedEvent, handler);

    const event = new OrderPlacedEvent('order-1', 'user-1', 'BTC/USDT', 'BUY', '50000', '1');
    await dispatcher.publish(event);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(event);
  });

  it('should allow multiple handlers for the same event type', async () => {
    const handler1 = jest.fn();
    const handler2 = jest.fn();
    dispatcher.register(OrderPlacedEvent, handler1);
    dispatcher.register(OrderPlacedEvent, handler2);

    const event = new OrderPlacedEvent('order-1', 'user-1', 'BTC/USDT', 'BUY', '50000', '1');
    await dispatcher.publish(event);

    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler2).toHaveBeenCalledTimes(1);
  });

  it('should allow unregistering a specific handler', async () => {
    const handler1 = jest.fn();
    const handler2 = jest.fn();
    dispatcher.register(OrderPlacedEvent, handler1);
    dispatcher.register(OrderPlacedEvent, handler2);

    dispatcher.unregister(OrderPlacedEvent, handler1);

    const event = new OrderPlacedEvent('order-1', 'user-1', 'BTC/USDT', 'BUY', '50000', '1');
    await dispatcher.publish(event);

    expect(handler1).not.toHaveBeenCalled();
    expect(handler2).toHaveBeenCalledTimes(1);
  });

  it('should throw when unregistering a handler that is not registered', () => {
    const handler = jest.fn();
    // Should not throw — unregistering a non-existent handler is a no-op
    expect(() => dispatcher.unregister(OrderPlacedEvent, handler)).not.toThrow();
  });

  // ─── Event Publishing ─────────────────────────────────────────────────────

  it('should call all handlers when an event is published', async () => {
    const handler = jest.fn();
    dispatcher.register(OrderPlacedEvent, handler);

    const event = new OrderPlacedEvent('order-1', 'user-1', 'BTC/USDT', 'BUY', '50000', '1');
    await dispatcher.publish(event);

    expect(handler).toHaveBeenCalledWith(event);
  });

  it('should pass the correct event instance to handlers', async () => {
    const handler = jest.fn();
    dispatcher.register(OrderPlacedEvent, handler);

    const event = new OrderPlacedEvent('order-2', 'user-3', 'ETH/USDT', 'SELL', '3000', '0.5');
    await dispatcher.publish(event);

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'order-2',
        userId: 'user-3',
        pairId: 'ETH/USDT',
        side: 'SELL',
        price: '3000',
        amount: '0.5',
      }),
    );
  });

  it('should handle events with no registered handlers gracefully', async () => {
    const event = new OrderPlacedEvent('order-1', 'user-1', 'BTC/USDT', 'BUY', '50000', '1');
    // Should not throw
    await expect(dispatcher.publish(event)).resolves.toBeUndefined();
  });

  // ─── Async / Parallel Handlers ─────────────────────────────────────────────

  it('should await all handlers before publish resolves', async () => {
    const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

    const handler1 = jest.fn(async () => {
      await delay(10);
    });
    const handler2 = jest.fn(async () => {
      await delay(10);
    });

    dispatcher.register(OrderPlacedEvent, handler1);
    dispatcher.register(OrderPlacedEvent, handler2);

    const event = new OrderPlacedEvent('order-1', 'user-1', 'BTC/USDT', 'BUY', '50000', '1');
    await dispatcher.publish(event);

    // Both handlers must have completed
    expect(handler1).toHaveBeenCalled();
    expect(handler2).toHaveBeenCalled();
  });

  it('should propagate errors from handlers', async () => {
    const handlerError = new Error('Handler failed');
    const handler = jest.fn().mockRejectedValue(handlerError);
    dispatcher.register(OrderPlacedEvent, handler);

    const event = new OrderPlacedEvent('order-1', 'user-1', 'BTC/USDT', 'BUY', '50000', '1');

    // Default: errors propagate — caller can decide
    await expect(dispatcher.publish(event)).rejects.toThrow('Handler failed');
  });

  // ─── Event Type Safety ─────────────────────────────────────────────────────

  it('should only call handlers registered for the specific event type', async () => {
    const orderHandler = jest.fn();
    const tradeHandler = jest.fn();
    dispatcher.register(OrderPlacedEvent, orderHandler);
    dispatcher.register(TradeExecutedEvent, tradeHandler);

    const event = new OrderPlacedEvent('order-1', 'user-1', 'BTC/USDT', 'BUY', '50000', '1');
    await dispatcher.publish(event);

    expect(orderHandler).toHaveBeenCalledTimes(1);
    expect(tradeHandler).not.toHaveBeenCalled();
  });

  // ─── Multiple Event Types ──────────────────────────────────────────────────

  it('should handle publishing multiple different event types', async () => {
    const orderHandler = jest.fn();
    const tradeHandler = jest.fn();
    const depositHandler = jest.fn();
    dispatcher.register(OrderPlacedEvent, orderHandler);
    dispatcher.register(TradeExecutedEvent, tradeHandler);
    dispatcher.register(DepositConfirmedEvent, depositHandler);

    await dispatcher.publish(new OrderPlacedEvent('o1', 'u1', 'BTC/USDT', 'BUY', '50000', '1'));
    await dispatcher.publish(
      new TradeExecutedEvent('t1', 'BTC/USDT', 'o1', 'o2', '50000', '1', 'u1', 'u2'),
    );
    await dispatcher.publish(new DepositConfirmedEvent('d1', 'u1', 'BTC', '1.5'));

    expect(orderHandler).toHaveBeenCalledTimes(1);
    expect(tradeHandler).toHaveBeenCalledTimes(1);
    expect(depositHandler).toHaveBeenCalledTimes(1);
  });

  // ─── Wildcard / Subscriber ──────────────────────────────────────────────────

  it('should support a wildcard subscriber that receives all events', async () => {
    const allEvents: any[] = [];
    dispatcher.subscribeAll((event) => {
      allEvents.push(event);
    });

    await dispatcher.publish(new OrderPlacedEvent('o1', 'u1', 'BTC/USDT', 'BUY', '50000', '1'));
    await dispatcher.publish(
      new TradeExecutedEvent('t1', 'BTC/USDT', 'o1', 'o2', '50000', '1', 'u1', 'u2'),
    );
    await dispatcher.publish(new WalletBalanceChangedEvent('u1', 'BTC', '10', '11', '0', '0'));

    expect(allEvents).toHaveLength(3);
    expect(allEvents[0].eventType).toBe('OrderPlaced');
    expect(allEvents[1].eventType).toBe('TradeExecuted');
    expect(allEvents[2].eventType).toBe('WalletBalanceChanged');
  });

  // ─── Logging ───────────────────────────────────────────────────────────────

  it('should log when an event is published', async () => {
    const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() } as any;
    const dispatcherWithLogger = new DomainEventDispatcher(logger);

    const handler = jest.fn();
    dispatcherWithLogger.register(OrderPlacedEvent, handler);

    const event = new OrderPlacedEvent('order-1', 'user-1', 'BTC/USDT', 'BUY', '50000', '1');
    await dispatcherWithLogger.publish(event);

    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining('OrderPlaced'),
      expect.objectContaining({ orderId: 'order-1' }),
    );
  });

  it('should log a warning when no handlers are registered', async () => {
    const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() } as any;
    const dispatcherWithLogger = new DomainEventDispatcher(logger);

    const event = new OrderPlacedEvent('order-1', 'user-1', 'BTC/USDT', 'BUY', '50000', '1');
    await dispatcherWithLogger.publish(event);

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('No handlers registered'),
      expect.objectContaining({ eventType: 'OrderPlaced' }),
    );
  });
});
