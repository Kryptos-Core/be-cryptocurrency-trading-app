import { ValueObject } from '../value-object.base';

/**
 * TradingPair — Value Object representing a base/quote currency pair.
 *
 * Canonical format: "BASE/QUOTE" (e.g. "BTC/USDT").
 * Both symbols are normalised to UPPER CASE.
 *
 * @example
 * ```typescript
 * const pair = TradingPair.of('BTC', 'USDT');
 * pair.symbol;       // 'BTC/USDT'
 * pair.baseCurrency; // 'BTC'
 * pair.quoteCurrency;// 'USDT'
 *
 * TradingPair.fromSymbol('eth/usdt').symbol; // 'ETH/USDT'
 * ```
 */
export class TradingPair extends ValueObject<{ base: string; quote: string }> {
  private constructor(props: { base: string; quote: string }) {
    super(props);
  }

  static of(base: string, quote: string): TradingPair {
    const b = base.trim().toUpperCase();
    const q = quote.trim().toUpperCase();
    if (!b) throw new Error('TradingPair: base currency must be non-empty');
    if (!q) throw new Error('TradingPair: quote currency must be non-empty');
    if (b === q) throw new Error(`TradingPair: base and quote must differ, got ${b}`);
    return new TradingPair({ base: b, quote: q });
  }

  static fromSymbol(symbol: string): TradingPair {
    const parts = symbol.split('/');
    if (parts.length !== 2) {
      throw new Error(`TradingPair: invalid symbol format "${symbol}" — expected "BASE/QUOTE"`);
    }
    return TradingPair.of(parts[0], parts[1]);
  }

  get baseCurrency(): string {
    return this.props.base;
  }

  get quoteCurrency(): string {
    return this.props.quote;
  }

  get symbol(): string {
    return `${this.props.base}/${this.props.quote}`;
  }

  equals(other: TradingPair): boolean {
    if (!other || !(other instanceof TradingPair)) return false;
    return this.props.base === other.props.base && this.props.quote === other.props.quote;
  }

  override toString(): string {
    return this.symbol;
  }
}
