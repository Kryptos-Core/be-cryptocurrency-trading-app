/**
 * ValueObject — base class for immutable value objects.
 *
 * Value objects are compared by their structural content, not by reference.
 * They have no identity and are immutable after construction.
 *
 * Usage:
 * ```typescript
 * class Money extends ValueObject<{ amount: number; currency: string }> {
 * get amount(): number { return this.props.amount; }
 * get currency(): string { return this.props.currency; }
 *
 * equals(other: Money): boolean {
 * return this.currency === other.currency && this.amount === other.amount;
 * }
 * }
 * ```
 *
 * @typeParam T - The shape of the value object's data.
 */
export abstract class ValueObject<T extends object> {
  constructor(protected readonly props: T) {
    Object.freeze(props);
  }

  /**
   * Structural equality — subclasses MUST implement.
   * Two value objects are equal iff all their properties are equal.
   */
  abstract equals(other: ValueObject<T>): boolean;

  /**
   * Returns a string representation for debugging.
   */
  toString(): string {
    return `${this.constructor.name}(${JSON.stringify(this.props)})`;
  }
}
