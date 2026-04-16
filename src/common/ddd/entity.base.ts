import { DomainEvent } from '../domain-events/base.event';
import type { AggregateRoot } from './aggregate-root.base';

/**
 * Entity — base for all domain entities with identity-based equality.
 *
 * Two entities are equal iff their IDs are equal, regardless of other
 * property values. This aligns with DDD's definition of entity equality.
 *
 * @typeParam TId - The type of the entity's identifier (string, number, branded type).
 *
 * @example
 * ```typescript
 * class Order extends Entity<string> {
 *   constructor(id: string, public status: OrderStatus) { super(id); }
 * }
 * const o1 = new Order('uuid-1', OrderStatus.PENDING);
 * const o2 = new Order('uuid-1', OrderStatus.FILLED);
 * o1.equals(o2); // true — same identity
 * ```
 */
export abstract class Entity<TId = string> {
  constructor(public readonly id: TId) {}

  /**
   * Identity equality — two entities are equal iff their IDs are equal.
   */
  equals(other: Entity<TId>): boolean {
    if (!(other instanceof Entity)) return false;
    if (other.constructor !== this.constructor) return false;
    return this.id === other.id;
  }

  toString(): string {
    return `${this.constructor.name}(${this.id})`;
  }
}
