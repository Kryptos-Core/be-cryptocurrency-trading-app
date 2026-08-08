import { DomainError } from '../domain-error.base';

/**
 * AUTH/INVALID_CREDENTIALS - 401
 */
export class InvalidCredentialsError extends DomainError {
  constructor(metadata?: Record<string, unknown>, cause?: unknown) {
    super({
      code: 'AUTH/INVALID_CREDENTIALS',
      httpStatus: 401,
      userMessage: 'Invalid email or password.',
      internalMessage: 'Authentication failed: credentials mismatch.',
      metadata,
      cause,
    });
  }
}

/**
 * AUTH/EMAIL_NOT_VERIFIED - 403
 */
export class EmailNotVerifiedError extends DomainError {
  constructor(metadata?: Record<string, unknown>, cause?: unknown) {
    super({
      code: 'AUTH/EMAIL_NOT_VERIFIED',
      httpStatus: 403,
      userMessage: 'Please verify your email address before continuing.',
      internalMessage: 'Email verification required.',
      metadata,
      cause,
    });
  }
}

/**
 * AUTH/OTP_EXPIRED - 410
 */
export class OtpExpiredError extends DomainError {
  constructor(metadata?: Record<string, unknown>, cause?: unknown) {
    super({
      code: 'AUTH/OTP_EXPIRED',
      httpStatus: 410,
      userMessage: 'The verification code has expired. Please request a new one.',
      internalMessage: 'OTP expired before submission.',
      metadata,
      cause,
    });
  }
}

/**
 * AUTH/OTP_INVALID - 401
 */
export class OtpInvalidError extends DomainError {
  constructor(metadata?: Record<string, unknown>, cause?: unknown) {
    super({
      code: 'AUTH/OTP_INVALID',
      httpStatus: 401,
      userMessage: 'The verification code is invalid.',
      internalMessage: 'OTP does not match.',
      metadata,
      cause,
    });
  }
}

/**
 * AUTH/ACCOUNT_LOCKED - 423
 */
export class AccountLockedError extends DomainError {
  constructor(metadata?: Record<string, unknown>, cause?: unknown) {
    super({
      code: 'AUTH/ACCOUNT_LOCKED',
      httpStatus: 423,
      userMessage: 'Your account is temporarily locked. Please try again later.',
      internalMessage: 'Account locked due to repeated failed attempts.',
      metadata,
      cause,
    });
  }
}

/**
 * AUTH/UNAUTHORIZED - 401
 */
export class UnauthorizedError extends DomainError {
  constructor(metadata?: Record<string, unknown>, cause?: unknown) {
    super({
      code: 'AUTH/UNAUTHORIZED',
      httpStatus: 401,
      userMessage: 'Authentication required.',
      internalMessage: 'No valid session present.',
      metadata,
      cause,
    });
  }
}

/**
 * AUTH/FORBIDDEN - 403
 */
export class ForbiddenError extends DomainError {
  constructor(metadata?: Record<string, unknown>, cause?: unknown) {
    super({
      code: 'AUTH/FORBIDDEN',
      httpStatus: 403,
      userMessage: 'You do not have permission to perform this action.',
      internalMessage: 'Authorization failed.',
      metadata,
      cause,
    });
  }
}
