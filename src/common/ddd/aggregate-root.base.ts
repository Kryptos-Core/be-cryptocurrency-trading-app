import type { DomainEvent } from '../domain-events/base.event';

/**
 * AggregateRoot — base class for domain aggregates.
 *
 * An aggregate is a cluster of related domain objects that can be treated as a single unit.
 * The aggregate root is the single entity that is responsible for invariants and
 * that external code references.
 *
 * Key responsibility: collect and emit domain events.
 *
 * Usage:
 * ```typescript
 * class Order extends AggregateRoot {
 * constructor(public readonly id: OrderId, private amount: Money) { super(); }
 *
 * adjustAmount(newAmount: Money): void {
 * this.invariant(newAmount.isPositive());
 * this.amount = newAmount;
 * this.addDomainEvent(new OrderAmountAdjustedEvent(this.id, newAmount));
 * }
 * }
 * ```
 */
export abstract class AggregateRoot {
  private readonly _domainEvents: DomainEvent[] = [];

  /**
   * Record a domain event to be published after the aggregate operation completes.
   */
  protected addDomainEvent(event: DomainEvent): void {
    this._domainEvents.push(event);
  }

  /**
   * Retrieve and clear all recorded domain events.
   * Call this after successfully applying aggregate changes.
   */
  public pullDomainEvents(): DomainEvent[] {
    const events = [...this._domainEvents];
    this._domainEvents.length = 0;
    return events;
  }

  /**
   * Check if there are any pending domain events.
   */
  public get hasDomainEvents(): boolean {
    return this._domainEvents.length > 0;
  }
}
