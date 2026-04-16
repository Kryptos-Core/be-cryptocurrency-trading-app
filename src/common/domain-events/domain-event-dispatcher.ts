import { Logger } from '@nestjs/common';
import { DomainEvent } from './base.event';

/**
 * Handler function type for domain events.
 */
export type DomainEventHandler<T extends DomainEvent = DomainEvent> = (
  event: T,
) => void | Promise<void>;

/**
 * DomainEventDispatcher — typed in-memory event bus.
 *
 * Features:
 * - Register handlers per event type (class reference)
 * - Unregister specific handlers
 * - Publish events (async, all handlers awaited)
 * - Wildcard subscriber (receives all events)
 * - Logging for debugging
 *
 * Does NOT replace @nestjs/event-emitter — this is a pure domain-layer bus
 * for business events. Infrastructure events (price ticks, WebSocket messages)
 * continue to use EventEmitter2 directly.
 */
export class DomainEventDispatcher {
  private readonly handlers = new Map<
    new (
      ...args: any[]
    ) => DomainEvent,
    Set<DomainEventHandler>
  >();
  private readonly wildcardHandlers: Array<(event: DomainEvent) => void | Promise<void>> = [];

  constructor(private readonly logger: Logger) {}

  /**
   * Register a handler for a specific event type.
   */
  register<T extends DomainEvent>(
    eventClass: new (...args: any[]) => T,
    handler: DomainEventHandler<T>,
  ): void {
    if (!this.handlers.has(eventClass)) {
      this.handlers.set(eventClass, new Set());
    }
    this.handlers.get(eventClass)!.add(handler as DomainEventHandler);
  }

  /**
   * Unregister a specific handler for an event type.
   * No-op if the handler is not registered.
   */
  unregister<T extends DomainEvent>(
    eventClass: new (...args: any[]) => T,
    handler: DomainEventHandler<T>,
  ): void {
    const handlers = this.handlers.get(eventClass);
    if (handlers) {
      handlers.delete(handler as DomainEventHandler);
      if (handlers.size === 0) {
        this.handlers.delete(eventClass);
      }
    }
  }

  /**
   * Subscribe to all events (wildcard).
   */
  subscribeAll(handler: (event: DomainEvent) => void | Promise<void>): void {
    this.wildcardHandlers.push(handler);
  }

  /**
   * Publish an event — all registered handlers are called asynchronously.
   * Errors from handlers propagate to the caller.
   */
  async publish(event: DomainEvent): Promise<void> {
    const eventType = (event as any).eventType ?? event.constructor.name;
    this.logger.log(`Publishing domain event: ${eventType}`, event);

    const handlers = this.handlers.get(event.constructor as new (...args: any[]) => DomainEvent);
    const handlerPromises: Promise<void>[] = [];

    if (handlers && handlers.size > 0) {
      for (const handler of handlers) {
        try {
          const result = (handler as (event: DomainEvent) => void | Promise<void>)(event);
          if (result instanceof Promise) {
            handlerPromises.push(result);
          } else {
            handlerPromises.push(Promise.resolve());
          }
        } catch (err) {
          this.logger.error(
            `Handler error for ${event.constructor.name}: ${(err as Error).message}`,
            (err as Error).stack,
          );
          handlerPromises.push(Promise.reject(err));
        }
      }
    }

    if (this.wildcardHandlers.length > 0) {
      for (const handler of this.wildcardHandlers) {
        const result = handler(event);
        if (result instanceof Promise) {
          handlerPromises.push(
            result.catch((err) => {
              this.logger.error(`Wildcard handler error: ${(err as Error).message}`);
            }),
          );
        }
      }
    }

    if (handlerPromises.length === 0) {
      this.logger.warn(`No handlers registered for event: ${event.constructor.name}`, {
        eventType: (event as any).eventType ?? event.constructor.name,
      });
      return;
    }

    await Promise.all(handlerPromises);
  }
}
