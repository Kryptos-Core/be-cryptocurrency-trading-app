import { ValueObject } from '../value-object.base';
import Decimal from 'decimal.js';

/**
 * Money — Value Object representing an amount in a specific currency.
 *
 * Uses Decimal.js internally for precise arithmetic. Amounts are stored as
 * strings to avoid floating-point precision issues across boundaries.
 *
 * @example
 * ```typescript
 * const price = Money.of('50000.00', 'USDT');
 * const fee = Money.of('0.001', 'BTC');
 * price.equals(Money.of('50000.00', 'USDT')); // true
 * price.isPositive(); // true
 * price.toDecimal(); // Decimal instance
 * ```
 */
export class Money extends ValueObject<{ amount: string; currency: string }> {
  private constructor(props: { amount: string; currency: string }) {
    super(props);
  }

  static of(amount: string | number | Decimal, currency: string): Money {
    const normalized = new Decimal(amount).toFixed();
    if (!currency || currency.trim() === '') {
      throw new Error('Money: currency must be non-empty');
    }
    return new Money({ amount: normalized, currency: currency.toUpperCase() });
  }

  static zero(currency: string): Money {
    return Money.of('0', currency);
  }

  get amount(): string {
    return this.props.amount;
  }

  get currency(): string {
    return this.props.currency;
  }

  toDecimal(): Decimal {
    return new Decimal(this.props.amount);
  }

  isZero(): boolean {
    return this.toDecimal().isZero();
  }

  isPositive(): boolean {
    return this.toDecimal().gt(0);
  }

  isNegative(): boolean {
    return this.toDecimal().lt(0);
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return Money.of(this.toDecimal().plus(other.toDecimal()), this.currency);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return Money.of(this.toDecimal().minus(other.toDecimal()), this.currency);
  }

  multiply(factor: string | number | Decimal): Money {
    return Money.of(this.toDecimal().times(new Decimal(factor)), this.currency);
  }

  isGreaterThan(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.toDecimal().gt(other.toDecimal());
  }

  isLessThan(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.toDecimal().lt(other.toDecimal());
  }

  isGreaterThanOrEqual(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.toDecimal().gte(other.toDecimal());
  }

  equals(other: Money): boolean {
    if (!other || !(other instanceof Money)) return false;
    return this.currency === other.currency && this.amount === other.amount;
  }

  override toString(): string {
    return `${this.amount} ${this.currency}`;
  }

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new Error(
        `Money: cannot operate on different currencies: ${this.currency} vs ${other.currency}`,
      );
    }
  }
}
