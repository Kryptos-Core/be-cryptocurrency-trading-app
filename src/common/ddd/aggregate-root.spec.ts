import { DomainEvent } from '../domain-events/base.event';
import { AggregateRoot } from './aggregate-root.base';

// Concrete test aggregate
class TestAggregate extends AggregateRoot {
  constructor(
    public readonly id: string,
    public value: number,
  ) {
    super();
  }

  changeValue(newValue: number): void {
    this.value = newValue;
    this.addDomainEvent(new TestValueChangedEvent(this.id, this.value));
  }

  failOperation(): void {
    this.addDomainEvent(new TestOperationFailedEvent(this.id, 'operation_failed'));
  }
}

// Concrete domain events for testing
class TestValueChangedEvent extends DomainEvent {
  public readonly eventType = 'TestValueChanged' as const;
  constructor(
    public readonly aggregateId: string,
    public readonly newValue: number,
  ) {
    super();
  }
}

class TestOperationFailedEvent extends DomainEvent {
  public readonly eventType = 'TestOperationFailed' as const;
  constructor(
    public readonly aggregateId: string,
    public readonly reason: string,
  ) {
    super();
  }
}

describe('AggregateRoot', () => {
  it('should create an aggregate with an id', () => {
    const aggregate = new TestAggregate('agg-1', 100);

    expect(aggregate.id).toBe('agg-1');
    expect(aggregate.value).toBe(100);
  });

  it('should initially have no domain events', () => {
    const aggregate = new TestAggregate('agg-1', 100);

    expect(aggregate.pullDomainEvents()).toEqual([]);
  });

  it('should record domain events after calling addDomainEvent', () => {
    const aggregate = new TestAggregate('agg-1', 100);

    aggregate.changeValue(200);
    const events = aggregate.pullDomainEvents();

    expect(events).toHaveLength(1);
    expect(events[0]).toBeInstanceOf(TestValueChangedEvent);
    expect((events[0] as TestValueChangedEvent).newValue).toBe(200);
  });

  it('should return empty array after pulling domain events', () => {
    const aggregate = new TestAggregate('agg-1', 100);
    aggregate.changeValue(200);

    aggregate.pullDomainEvents();
    expect(aggregate.pullDomainEvents()).toEqual([]);
  });

  it('should accumulate multiple domain events', () => {
    const aggregate = new TestAggregate('agg-1', 100);

    aggregate.changeValue(200);
    aggregate.changeValue(300);
    aggregate.failOperation();

    const events = aggregate.pullDomainEvents();
    expect(events).toHaveLength(3);
    expect((events[0] as TestValueChangedEvent).newValue).toBe(200);
    expect((events[1] as TestValueChangedEvent).newValue).toBe(300);
    expect((events[2] as TestOperationFailedEvent).reason).toBe('operation_failed');
  });

  it('should attach an eventId and occurredOn to each event', () => {
    const aggregate = new TestAggregate('agg-1', 100);
    const before = new Date();

    aggregate.changeValue(200);
    const events = aggregate.pullDomainEvents();

    expect(events[0].eventId).toBeDefined();
    expect(events[0].occurredOn.getTime()).toBeGreaterThanOrEqual(before.getTime());
  });

  it('should be instance of AggregateRoot', () => {
    const aggregate = new TestAggregate('agg-1', 100);
    expect(aggregate).toBeInstanceOf(AggregateRoot);
  });

  it('should return empty array on second pull', () => {
    const aggregate = new TestAggregate('agg-1', 100);
    aggregate.changeValue(200);

    const events1 = aggregate.pullDomainEvents();
    const events2 = aggregate.pullDomainEvents();

    expect(events1).toHaveLength(1);
    expect(events2).toHaveLength(0); // Events were cleared by first pull
  });
});
