import { Logger } from '@nestjs/common';
import { DomainEvent } from './base.event';

export type DomainEventHandler<T extends DomainEvent = DomainEvent> = (
  event: T,
) => void | Promise<void>;

type DomainEventClass<T extends DomainEvent = DomainEvent> = abstract new (...args: never[]) => T;
type EventWithOptionalType = DomainEvent & { eventType?: string };

export class DomainEventDispatcher {
  private readonly handlers = new Map<DomainEventClass, Set<DomainEventHandler>>();
  private readonly wildcardHandlers: Array<(event: DomainEvent) => void | Promise<void>> = [];

  constructor(private readonly logger: Logger) {}

  private resolveEventType(event: DomainEvent): string {
    return (event as EventWithOptionalType).eventType ?? event.constructor.name;
  }

  register<T extends DomainEvent>(
    eventClass: DomainEventClass<T>,
    handler: DomainEventHandler<T>,
  ): void {
    let bucket = this.handlers.get(eventClass);
    if (!bucket) {
      bucket = new Set();
      this.handlers.set(eventClass, bucket);
    }
    bucket.add(handler as DomainEventHandler);
  }

  unregister<T extends DomainEvent>(
    eventClass: DomainEventClass<T>,
    handler: DomainEventHandler<T>,
  ): void {
    const handlers = this.handlers.get(eventClass);
    if (handlers) {
      handlers.delete(handler as DomainEventHandler);
      if (handlers.size === 0) this.handlers.delete(eventClass);
    }
  }

  subscribeAll(handler: (event: DomainEvent) => void | Promise<void>): void {
    this.wildcardHandlers.push(handler);
  }

  async publish(event: DomainEvent): Promise<void> {
    const eventType = this.resolveEventType(event);
    this.logger.log(`Publishing domain event: ${eventType}`, event);

    const handlers = this.handlers.get(event.constructor as DomainEventClass);
    const handlerPromises: Promise<void>[] = [];

    if (handlers && handlers.size > 0) {
      for (const handler of handlers) {
        try {
          const result = (handler as (event: DomainEvent) => void | Promise<void>)(event);
          handlerPromises.push(result instanceof Promise ? result : Promise.resolve());
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err));
          this.logger.error(
            `Handler error for ${event.constructor.name}: ${error.message}`,
            error.stack,
          );
          handlerPromises.push(Promise.reject(error));
        }
      }
    }

    if (this.wildcardHandlers.length > 0) {
      for (const handler of this.wildcardHandlers) {
        const result = handler(event);
        if (result instanceof Promise) {
          handlerPromises.push(
            result.catch((err: unknown) => {
              this.logger.error(
                `Wildcard handler error: ${err instanceof Error ? err.message : String(err)}`,
              );
            }),
          );
        }
      }
    }

    if (handlerPromises.length === 0) {
      this.logger.warn(`No handlers registered for event: ${event.constructor.name}`, {
        eventType: this.resolveEventType(event),
      });
      return;
    }

    await Promise.all(handlerPromises);
  }
}
