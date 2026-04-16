import { ValueObject } from './value-object.base';

// Concrete value objects for testing
class Money extends ValueObject<{ amount: number; currency: string }> {
  get amount(): number {
    return this.props.amount;
  }
  get currency(): string {
    return this.props.currency;
  }

  equals(other: Money): boolean {
    if (!other || typeof other !== 'object') return false;
    return this.currency === other.currency && this.amount === other.amount;
  }

  override toString(): string {
    return `Money({ amount: ${this.amount}, currency: "${this.currency}" })`;
  }
}

class Price extends ValueObject<{ value: number; precision: number }> {
  get value(): number {
    return this.props.value;
  }
  get precision(): number {
    return this.props.precision;
  }

  equals(other: Price): boolean {
    if (!other || typeof other !== 'object') return false;
    return this.value === other.value && this.precision === other.precision;
  }
}

describe('ValueObject', () => {
  // ─── Structural Equality ──────────────────────────────────────────────────

  it('should be equal when all properties match', () => {
    const m1 = new Money({ amount: 100, currency: 'USD' });
    const m2 = new Money({ amount: 100, currency: 'USD' });

    expect(m1.equals(m2)).toBe(true);
  });

  it('should be not equal when properties differ', () => {
    const m1 = new Money({ amount: 100, currency: 'USD' });
    const m2 = new Money({ amount: 200, currency: 'USD' });

    expect(m1.equals(m2)).toBe(false);
  });

  it('should be not equal when currency differs', () => {
    const m1 = new Money({ amount: 100, currency: 'USD' });
    const m2 = new Money({ amount: 100, currency: 'EUR' });

    expect(m1.equals(m2)).toBe(false);
  });

  it('should be not equal when comparing to null', () => {
    const m = new Money({ amount: 100, currency: 'USD' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(m.equals(null as any)).toBe(false);
  });

  it('should be not equal when comparing to undefined', () => {
    const m = new Money({ amount: 100, currency: 'USD' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(m.equals(undefined as any)).toBe(false);
  });

  // ─── Immutability ─────────────────────────────────────────────────────────

  it('should expose properties via getters', () => {
    const m = new Money({ amount: 500, currency: 'BTC' });

    expect(m.amount).toBe(500);
    expect(m.currency).toBe('BTC');
  });

  it('should not allow direct mutation of props', () => {
    const m = new Money({ amount: 100, currency: 'USD' });

    expect(() => {
      // Cast to any to bypass protected access and test runtime immutability
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (m as any).props.amount = 999;
    }).toThrow();
  });

  // ─── ToString / Serialization ──────────────────────────────────────────────

  it('should have a meaningful toString', () => {
    const m = new Money({ amount: 100, currency: 'USD' });
    expect(m.toString()).toBe('Money({ amount: 100, currency: "USD" })');
  });

  // ─── Instance Checks ──────────────────────────────────────────────────────

  it('should be instance of ValueObject', () => {
    const m = new Money({ amount: 100, currency: 'USD' });
    expect(m).toBeInstanceOf(ValueObject);
  });

  it('should distinguish between different value object types', () => {
    const m = new Money({ amount: 100, currency: 'USD' });
    const p = new Price({ value: 100, precision: 2 });

    // Different VO types are never equal — cast to any for cross-type comparison test
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((m as any).equals(p)).toBe(false);
  });

  // ─── Edge Cases ───────────────────────────────────────────────────────────

  it('should handle zero values', () => {
    const m1 = new Money({ amount: 0, currency: 'USD' });
    const m2 = new Money({ amount: 0, currency: 'USD' });

    expect(m1.equals(m2)).toBe(true);
  });

  it('should handle negative amounts', () => {
    const m1 = new Money({ amount: -50, currency: 'USD' });
    const m2 = new Money({ amount: -50, currency: 'USD' });

    expect(m1.equals(m2)).toBe(true);
    expect(m1.equals(new Money({ amount: 50, currency: 'USD' }))).toBe(false);
  });
});
