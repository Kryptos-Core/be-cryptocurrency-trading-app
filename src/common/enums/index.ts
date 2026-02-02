/**
 * Global Enums & Type Definitions
 * Centralized location for all domain enums across modules
 */

// ============================================
// Order Module Enums
// ============================================

/** Order side: BUY or SELL */
export enum OrderSide {
  BUY = 'BUY',
  SELL = 'SELL',
}

/** Order type: LIMIT or MARKET */
export enum OrderType {
  LIMIT = 'LIMIT',
  MARKET = 'MARKET',
}

/** Order status lifecycle */
export enum OrderStatus {
  OPEN = 'OPEN',
  PARTIAL = 'PARTIAL',
  FILLED = 'FILLED',
  CANCELLED = 'CANCELLED',
  REJECTED = 'REJECTED',
}

/** Order time in force: GTC (Good Till Cancel), IOC (Immediate Or Cancel), FOK (Fill Or Kill) */
export enum OrderTimeInForce {
  GTC = 'GTC',
  IOC = 'IOC',
  FOK = 'FOK',
}

// ============================================
// User Module Enums
// ============================================

/** User account status */
export enum UserStatus {
  ACTIVE = 'ACTIVE',
  BANNED = 'BANNED',
  PENDING = 'PENDING',
}

// ============================================
// Deposit Module Enums
// ============================================

/** Deposit status lifecycle */
export enum DepositStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  CREDITED = 'CREDITED',
  FAILED = 'FAILED',
}

// ============================================
// Withdrawal Module Enums
// ============================================

/** Withdrawal status lifecycle */
export enum WithdrawalStatus {
  REQUESTED = 'REQUESTED',
  APPROVED = 'APPROVED',
  SENT = 'SENT',
  COMPLETED = 'COMPLETED',
  REJECTED = 'REJECTED',
  FAILED = 'FAILED',
}

// ============================================
// Price Alert Module Enums
// ============================================

/** Price alert comparison operator */
export enum PriceAlertCondition {
  ABOVE = 'ABOVE',
  BELOW = 'BELOW',
}

// ============================================
// Wallet Module Enums
// ============================================

/** Wallet transaction action types */
export enum WalletTransactionAction {
  CREDIT = 'CREDIT',
  DEBIT = 'DEBIT',
  FREEZE = 'FREEZE',
  UNFREEZE = 'UNFREEZE',
  TRANSFER = 'TRANSFER',
}

/** Wallet transaction reference types for audit trail */
export enum WalletReferenceType {
  DEPOSIT = 'DEPOSIT',
  WITHDRAW = 'WITHDRAW',
  ORDER = 'ORDER',
  TRADE = 'TRADE',
  ADJUST = 'ADJUST',
  TRANSFER = 'TRANSFER',
}

/** Wallet ledger entry direction - Double-entry accounting */
export enum WalletLedgerDirection {
  CREDIT = 'CREDIT',
  DEBIT = 'DEBIT',
}

// ============================================
// Configuration Enums
// ============================================

/** Application environment */
export enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}
