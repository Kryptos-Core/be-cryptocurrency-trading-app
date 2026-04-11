/**
 * MySQL stored procedure names (`CALL sp_*`).
 * Grouped like company convention: one export per domain, SCREAMING_SNAKE keys.
 * Keep in sync with migrations — any CREATE/DROP PROCEDURE change updates this file.
 */

export const ORDER_STORE_PROCEDURE = {
  FIND_BY_ID: 'sp_order_find_by_id',
  FIND_BY_USER_IDEMPOTENCY: 'sp_order_find_by_user_idempotency',
  BOOK: 'sp_order_book',
  CREATE: 'sp_order_create',
  CANCEL: 'sp_order_cancel',
  FIND_BY_USER: 'sp_order_find_by_user',
  COUNT_BY_USER: 'sp_order_count_by_user',
} as const;

export const MATCHING_STORE_PROCEDURE = {
  ORDERS_OPEN_FOR_PAIR: 'sp_orders_open_for_pair',
  TRADE_EXECUTE: 'sp_trade_execute',
  /** Same procedure as ORDER_STORE_PROCEDURE.CANCEL */
  ORDER_CANCEL: ORDER_STORE_PROCEDURE.CANCEL,
} as const;

export const USER_STORE_PROCEDURE = {
  FIND_BY_ID: 'sp_user_find_by_id',
  FIND_BY_EMAIL: 'sp_user_find_by_email',
  CREATE: 'sp_user_create',
  UPDATE: 'sp_user_update',
  DELETE: 'sp_user_delete',
  GET_STATISTICS: 'sp_user_get_statistics',
  EMAIL_EXISTS: 'sp_user_email_exists',
  FIND_BY_LINKED_WALLET: 'sp_user_find_by_linked_wallet',
  CREATE_WALLET_ONLY: 'sp_user_create_wallet_only',
  SET_TWO_FA: 'sp_user_set_two_fa',
  UPDATE_PROFILE_BASIC: 'sp_user_update_profile_basic',
  UPDATE_AVATAR: 'sp_user_update_avatar',
  SECURITY_CHANGE_REQUEST_CREATE: 'sp_user_security_change_request_create',
  SECURITY_CHANGE_REQUEST_FIND_PENDING: 'sp_user_security_change_request_find_pending',
  SECURITY_CHANGE_REQUEST_REVIEW: 'sp_user_security_change_request_review',
} as const;

export const WALLET_STORE_PROCEDURE = {
  FIND_BY_USER_CURRENCY: 'sp_wallet_find_by_user_currency',
  APPLY_BALANCE_DELTA: 'sp_wallet_apply_balance_delta',
} as const;

export const WALLET_LEDGER_STORE_PROCEDURE = {
  CREATE: 'sp_wallet_ledger_create',
} as const;

export const ADMIN_WALLET_ADJUSTMENT_STORE_PROCEDURE = {
  CREATE: 'sp_admin_wallet_adjustment_create',
  FIND_BY_TARGET: 'sp_admin_wallet_adjustment_find_by_target',
} as const;

export const CURRENCY_STORE_PROCEDURE = {
  FIND_BY_ID: 'sp_currency_find_by_id',
  FIND_BY_SYMBOL: 'sp_currency_find_by_symbol',
  FIND_ACTIVE: 'sp_currency_find_active',
  FIND_TRADABLE: 'sp_currency_find_tradable',
  SYMBOL_EXISTS: 'sp_currency_symbol_exists',
  CREATE: 'sp_currency_create',
  UPDATE: 'sp_currency_update',
  DELETE: 'sp_currency_delete',
  FIND_ALL: 'sp_currency_find_all',
  COUNT: 'sp_currency_count',
} as const;

export const MARKET_STORE_PROCEDURE = {
  FIND_BY_ID: 'sp_market_find_by_id',
  FIND_BY_SYMBOL: 'sp_market_find_by_symbol',
  FIND_BY_CURRENCIES: 'sp_market_find_by_currencies',
  FIND_ALL: 'sp_market_find_all',
  COUNT: 'sp_market_count',
  FIND_ALL_FILTERED: 'sp_market_find_all_filtered',
  COUNT_FILTERED: 'sp_market_count_filtered',
  FIND_ALL_ADVANCED: 'sp_market_find_all_advanced',
  COUNT_ADVANCED: 'sp_market_count_advanced',
  FIND_ACTIVE: 'sp_market_find_active',
  PAIR_EXISTS: 'sp_market_pair_exists',
  SYMBOL_EXISTS: 'sp_market_symbol_exists',
  ORDER_BOOK_BIDS: 'sp_market_order_book_bids',
  ORDER_BOOK_ASKS: 'sp_market_order_book_asks',
  TICKER: 'sp_market_ticker',
  RECENT_TRADES: 'sp_market_recent_trades',
  CREATE: 'sp_market_create',
  UPDATE: 'sp_market_update',
  DELETE: 'sp_market_delete',
} as const;

export const NOTIFICATION_STORE_PROCEDURE = {
  CREATE: 'sp_notification_create',
  FIND_BY_USER: 'sp_notification_find_by_user',
  COUNT_UNREAD: 'sp_notification_count_unread',
  MARK_READ: 'sp_notification_mark_read',
  MARK_ALL_READ: 'sp_notification_mark_all_read',
} as const;

export const PAYMENT_CONFIG_STORE_PROCEDURE = {
  FIND_ACTIVE: 'sp_payment_config_find_active',
  LIST: 'sp_payment_config_list',
  UPSERT: 'sp_payment_config_upsert',
  SET_STATUS: 'sp_payment_config_set_status',
} as const;

export const FIAT_DEPOSIT_STORE_PROCEDURE = {
  CREATE: 'sp_fiat_deposit_create',
  UPDATE_STATUS: 'sp_fiat_deposit_update_status',
  FIND_BY_ORDER_CODE: 'sp_fiat_deposit_find_by_order_code',
  FIND_BY_USER: 'sp_fiat_deposit_find_by_user',
} as const;

/** All domain groups — use in tests / tooling to validate invariants without duplicating names. */
export const ALL_STORE_PROCEDURE_GROUPS = [
  ORDER_STORE_PROCEDURE,
  MATCHING_STORE_PROCEDURE,
  USER_STORE_PROCEDURE,
  WALLET_STORE_PROCEDURE,
  WALLET_LEDGER_STORE_PROCEDURE,
  ADMIN_WALLET_ADJUSTMENT_STORE_PROCEDURE,
  CURRENCY_STORE_PROCEDURE,
  MARKET_STORE_PROCEDURE,
  NOTIFICATION_STORE_PROCEDURE,
  PAYMENT_CONFIG_STORE_PROCEDURE,
  FIAT_DEPOSIT_STORE_PROCEDURE,
] as const;

/** Legacy aggregate — prefer importing `*_STORE_PROCEDURE` in new code. */
export const STORED_PROCEDURE_NAMES = {
  order: ORDER_STORE_PROCEDURE,
  matching: MATCHING_STORE_PROCEDURE,
  user: USER_STORE_PROCEDURE,
  wallet: WALLET_STORE_PROCEDURE,
  walletLedger: WALLET_LEDGER_STORE_PROCEDURE,
  adminWalletAdjustment: ADMIN_WALLET_ADJUSTMENT_STORE_PROCEDURE,
  currency: CURRENCY_STORE_PROCEDURE,
  market: MARKET_STORE_PROCEDURE,
  notification: NOTIFICATION_STORE_PROCEDURE,
  paymentConfig: PAYMENT_CONFIG_STORE_PROCEDURE,
  fiatDeposit: FIAT_DEPOSIT_STORE_PROCEDURE,
} as const;

export type StoredProcedureNames = typeof STORED_PROCEDURE_NAMES;
