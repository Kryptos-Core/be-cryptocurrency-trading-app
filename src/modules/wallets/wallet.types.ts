/**
 * Wallet Module Types & Enums
 * Central location for all wallet-related type definitions
 */

/**
 * Wallet Transaction Action Types
 * Defines all possible transaction operations on wallet balance
 */
export enum WalletTransactionAction {
  /** Add funds to available balance */
  CREDIT = 'CREDIT',
  /** Remove funds from available balance */
  DEBIT = 'DEBIT',
  /** Move funds from available to frozen balance (for orders) */
  FREEZE = 'FREEZE',
  /** Move funds from frozen to available balance */
  UNFREEZE = 'UNFREEZE',
  /** Transfer funds between users */
  TRANSFER = 'TRANSFER',
}

/**
 * Wallet Reference Types
 * Categories for audit trail tracking of ledger entries
 */
export enum WalletReferenceType {
  /** User deposit from external source */
  DEPOSIT = 'DEPOSIT',
  /** User withdrawal to external address */
  WITHDRAW = 'WITHDRAW',
  /** Order placement or modification */
  ORDER = 'ORDER',
  /** Trade execution */
  TRADE = 'TRADE',
  /** Manual adjustment by admin */
  ADJUST = 'ADJUST',
  /** Transfer between users */
  TRANSFER = 'TRANSFER',
}

/**
 * Ledger Entry Direction
 * Double-entry accounting: every transaction creates CREDIT and DEBIT entries
 */
export enum WalletLedgerDirection {
  /** Money flowing in (source account) */
  CREDIT = 'CREDIT',
  /** Money flowing out (destination account) */
  DEBIT = 'DEBIT',
}
