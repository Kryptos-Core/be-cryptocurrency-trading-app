import type { Currency } from '@/entities/currency.entity';

/** Cap rows so Binance-sized catalogs do not explode list endpoints. */
export const SYNTHETIC_ZERO_WALLET_ROWS_LIMIT = 48;

export type SyntheticWalletRow = {
  wallet_id: string;
  user_id: string;
  currency_id: string;
  available: string;
  frozen: string;
  updated_at?: Date;
  currency_symbol: string;
  currency_name: string;
};

/**
 * Deterministic pseudo-UUID per currency so each synthetic row has a stable unique id for clients.
 */
export function syntheticWalletIdForCurrencyId(currencyId: string): string {
  const hex = currencyId.replace(/-/g, '').padEnd(32, '0').slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/**
 * When the user has no rows in `wallets` yet, expose zero-balance rows from tradable currencies
 * so GET /wallets + dashboard portfolio are not empty after a fresh DB bootstrap.
 */
export function mapTradableCurrenciesToSyntheticWalletRows(
  currencies: Currency[],
): SyntheticWalletRow[] {
  const sorted = [...currencies].sort((a, b) => String(a.symbol).localeCompare(String(b.symbol)));
  return sorted.slice(0, SYNTHETIC_ZERO_WALLET_ROWS_LIMIT).map((c) => ({
    wallet_id: syntheticWalletIdForCurrencyId(c.currency_id),
    user_id: '',
    currency_id: c.currency_id,
    available: '0',
    frozen: '0',
    currency_symbol: c.symbol ?? '',
    currency_name: (c.name ?? c.symbol ?? '') as string,
  }));
}
