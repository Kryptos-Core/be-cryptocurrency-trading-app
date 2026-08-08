/**
 * Domain Error barrel — central export for all DomainError subclasses.
 *
 * Import from this barrel inside services / use-cases:
 *   import { InvalidCredentialsError, InsufficientBalanceError } from '@/common/errors';
 *
 * Filter mapping (filters/domain-error.filter.ts) picks DomainError and
 * renders toResponseJSON() with its httpStatus.
 */
export { DomainError } from './domain-error.base';

export {
  InvalidCredentialsError,
  EmailNotVerifiedError,
  OtpExpiredError,
  OtpInvalidError,
  AccountLockedError,
  UnauthorizedError,
  ForbiddenError,
} from './auth-errors';

export {
  InsufficientBalanceError,
  WalletLockedError,
  ChainUnavailableError,
  AmountBelowMinError,
  AmountAboveMaxError,
  WalletNotFoundError,
  InvalidAddressError,
} from './treasury-errors';

export {
  SchemaValidationError,
  RequiredFieldMissingError,
} from './validation-errors';

export {
  ResourceNotFoundError,
  ResourceConflictError,
  RateLimitedError,
  UnexpectedError,
  ExternalServiceError,
} from './resource-errors';

// Re-export legacy descriptor factories so existing call sites continue to work.
export * from './error-descriptors';

export type ErrorCode =
  | 'AUTH/INVALID_CREDENTIALS'
  | 'AUTH/EMAIL_NOT_VERIFIED'
  | 'AUTH/OTP_EXPIRED'
  | 'AUTH/OTP_INVALID'
  | 'AUTH/ACCOUNT_LOCKED'
  | 'AUTH/UNAUTHORIZED'
  | 'AUTH/FORBIDDEN'
  | 'TREASURY/INSUFFICIENT_BALANCE'
  | 'TREASURY/WALLET_LOCKED'
  | 'TREASURY/CHAIN_UNAVAILABLE'
  | 'TREASURY/AMOUNT_BELOW_MIN'
  | 'TREASURY/AMOUNT_ABOVE_MAX'
  | 'TREASURY/WALLET_NOT_FOUND'
  | 'TREASURY/INVALID_ADDRESS'
  | 'VALIDATION/SCHEMA_INVALID'
  | 'VALIDATION/REQUIRED_FIELD_MISSING'
  | 'RESOURCE/NOT_FOUND'
  | 'RESOURCE/CONFLICT'
  | 'RESOURCE/RATE_LIMITED'
  | 'INTERNAL/UNEXPECTED'
  | 'INTERNAL/EXTERNAL_SERVICE';
