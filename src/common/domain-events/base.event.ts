/**
 * DomainEvent — base class for all domain events.
 *
 * Every event carries:
 * - eventId: unique identifier (monotonic, timestamp-based)
 * - occurredOn: when the event occurred
 *
 * Uses TypeScript `readonly` for compile-time immutability safety.
 * Concrete events extend this class and define their own payload.
 */
export abstract class DomainEvent {
  public readonly eventId: string;
  public readonly occurredOn: Date;

  private static _counter = 0;
  private static _lastTimestamp = 0;

  constructor() {
    const now = Date.now();
    if (now === DomainEvent._lastTimestamp) {
      DomainEvent._counter++;
    } else {
      DomainEvent._counter = 0;
      DomainEvent._lastTimestamp = now;
    }

    this.eventId = `${now.toString(36)}-${DomainEvent._counter.toString(36).padStart(4, '0')}`;
    this.occurredOn = new Date();
  }
}
