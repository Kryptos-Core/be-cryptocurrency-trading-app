/**
 * Entity base class.
 *
 * Two entities are equal when they have the same identity (id),
 * regardless of their attribute values.
 */
export abstract class Entity<TId> {
  constructor(protected readonly _id: TId) {}

  get id(): TId {
    return this._id;
  }

  equals(other?: Entity<TId>): boolean {
    if (!other || !(other instanceof Entity)) return false;
    if (this === other) return true;
    return this._id === other._id;
  }

  /**
   * Human-readable representation for logging and debugging.
   * Subclasses should override with more specific format (e.g. `Order[order-abc123]`).
   */
  toString(): string {
    return `${this.constructor.name}(${String(this._id)})`;
  }
}
