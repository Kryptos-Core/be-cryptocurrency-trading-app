import { DomainError } from '../domain-error.base';

/**
 * TREASURY/INSUFFICIENT_BALANCE - 422
 */
export class InsufficientBalanceError extends DomainError {
  constructor(metadata?: Record<string, unknown>, cause?: unknown) {
    super({
      code: 'TREASURY/INSUFFICIENT_BALANCE',
      httpStatus: 422,
      userMessage: 'Insufficient balance for this operation.',
      internalMessage: 'Wallet balance below required amount.',
      metadata,
      cause,
    });
  }
}

/**
 * TREASURY/WALLET_LOCKED - 423
 */
export class WalletLockedError extends DomainError {
  constructor(metadata?: Record<string, unknown>, cause?: unknown) {
    super({
      code: 'TREASURY/WALLET_LOCKED',
      httpStatus: 423,
      userMessage: 'This wallet is currently locked.',
      internalMessage: 'Wallet lock flag set.',
      metadata,
      cause,
    });
  }
}

/**
 * TREASURY/CHAIN_UNAVAILABLE - 503
 */
export class ChainUnavailableError extends DomainError {
  constructor(metadata?: Record<string, unknown>, cause?: unknown) {
    super({
      code: 'TREASURY/CHAIN_UNAVAILABLE',
      httpStatus: 503,
      userMessage: 'The blockchain network is temporarily unavailable.',
      internalMessage: 'RPC chain unavailable.',
      metadata,
      cause,
    });
  }
}

/**
 * TREASURY/AMOUNT_BELOW_MIN - 422
 */
export class AmountBelowMinError extends DomainError {
  constructor(metadata?: Record<string, unknown>, cause?: unknown) {
    super({
      code: 'TREASURY/AMOUNT_BELOW_MIN',
      httpStatus: 422,
      userMessage: 'Amount is below the minimum allowed for this transaction.',
      internalMessage: 'Amount below auto-min threshold.',
      metadata,
      cause,
    });
  }
}

/**
 * TREASURY/AMOUNT_ABOVE_MAX - 422
 */
export class AmountAboveMaxError extends DomainError {
  constructor(metadata?: Record<string, unknown>, cause?: unknown) {
    super({
      code: 'TREASURY/AMOUNT_ABOVE_MAX',
      httpStatus: 422,
      userMessage: 'Amount exceeds the maximum allowed for this transaction.',
      internalMessage: 'Amount above auto-max threshold.',
      metadata,
      cause,
    });
  }
}

/**
 * TREASURY/WALLET_NOT_FOUND - 404
 */
export class WalletNotFoundError extends DomainError {
  constructor(metadata?: Record<string, unknown>, cause?: unknown) {
    super({
      code: 'TREASURY/WALLET_NOT_FOUND',
      httpStatus: 404,
      userMessage: 'Wallet not found.',
      internalMessage: 'Wallet record not found.',
      metadata,
      cause,
    });
  }
}

/**
 * TREASURY/INVALID_ADDRESS - 422
 */
export class InvalidAddressError extends DomainError {
  constructor(metadata?: Record<string, unknown>, cause?: unknown) {
    super({
      code: 'TREASURY/INVALID_ADDRESS',
      httpStatus: 422,
      userMessage: 'The provided wallet address is invalid.',
      internalMessage: 'Address format validation failed.',
      metadata,
      cause,
    });
  }
}
