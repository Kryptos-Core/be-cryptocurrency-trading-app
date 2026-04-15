/**
 * Port: Currency Lookup
 * Domain-level abstraction for resolving currency metadata.
 */
export interface CurrencyLookupPort {
  getSymbol(currencyId: string): Promise<string>;
}

export const CURRENCY_LOOKUP = Symbol('CURRENCY_LOOKUP');
