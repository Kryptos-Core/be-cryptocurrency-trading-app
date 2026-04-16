import { Entity } from './entity.base';

class User extends Entity<string> {
  constructor(
    id: string,
    public readonly name: string,
  ) {
    super(id);
  }
}

class Product extends Entity<number> {
  constructor(
    id: number,
    public readonly sku: string,
  ) {
    super(id);
  }
}

describe('Entity', () => {
  // ─── Identity Equality ─────────────────────────────────────────────────────

  it('should be equal to another entity with the same id and type', () => {
    const u1 = new User('abc', 'Alice');
    const u2 = new User('abc', 'Bob');
    expect(u1.equals(u2)).toBe(true);
  });

  it('should not be equal to another entity with a different id', () => {
    const u1 = new User('abc', 'Alice');
    const u2 = new User('xyz', 'Alice');
    expect(u1.equals(u2)).toBe(false);
  });

  it('should not be equal to an entity of a different type, even if ids match', () => {
    const user = new User('1', 'Alice');
    const product = new Product(1, 'SKU-001');
    // Cast to any for cross-type comparison test
    expect(user.equals(product as any)).toBe(false);
  });

  it('should not be equal to null', () => {
    const u = new User('abc', 'Alice');
    expect(u.equals(null as any)).toBe(false);
  });

  it('should not be equal to undefined', () => {
    const u = new User('abc', 'Alice');
    expect(u.equals(undefined as any)).toBe(false);
  });

  // ─── String ID ────────────────────────────────────────────────────────────

  it('should expose the id', () => {
    const u = new User('uuid-123', 'Alice');
    expect(u.id).toBe('uuid-123');
  });

  // ─── Numeric ID ──────────────────────────────────────────────────────────

  it('should support numeric IDs', () => {
    const p1 = new Product(42, 'SKU-A');
    const p2 = new Product(42, 'SKU-B');
    const p3 = new Product(99, 'SKU-A');

    expect(p1.equals(p2)).toBe(true);
    expect(p1.equals(p3)).toBe(false);
  });

  // ─── toString ─────────────────────────────────────────────────────────────

  it('should have a meaningful toString', () => {
    const u = new User('uuid-123', 'Alice');
    expect(u.toString()).toBe('User(uuid-123)');
  });

  // ─── Instance ─────────────────────────────────────────────────────────────

  it('should be an instance of Entity', () => {
    const u = new User('abc', 'Alice');
    expect(u).toBeInstanceOf(Entity);
  });

  // ─── Self Equality ────────────────────────────────────────────────────────

  it('should be equal to itself', () => {
    const u = new User('abc', 'Alice');
    expect(u.equals(u)).toBe(true);
  });
});
