import {
  InvalidCredentialsError,
  EmailNotVerifiedError,
  OtpExpiredError,
  OtpInvalidError,
  AccountLockedError,
  UnauthorizedError,
  ForbiddenError,
} from './auth-errors';
import { DomainError } from './domain-error.base';

describe('auth errors', () => {
  it.each([
    [InvalidCredentialsError, 'AUTH/INVALID_CREDENTIALS', 401],
    [EmailNotVerifiedError, 'AUTH/EMAIL_NOT_VERIFIED', 403],
    [OtpExpiredError, 'AUTH/OTP_EXPIRED', 410],
    [OtpInvalidError, 'AUTH/OTP_INVALID', 401],
    [AccountLockedError, 'AUTH/ACCOUNT_LOCKED', 423],
    [UnauthorizedError, 'AUTH/UNAUTHORIZED', 401],
    [ForbiddenError, 'AUTH/FORBIDDEN', 403],
  ])('%p has correct code + httpStatus', (Ctor, code, status) => {
    const err = new Ctor();
    expect(err).toBeInstanceOf(DomainError);
    expect(err.code).toBe(code);
    expect(err.httpStatus).toBe(status);
  });

  it('all errors have non-empty userMessage', () => {
    const errors = [
      InvalidCredentialsError,
      EmailNotVerifiedError,
      OtpExpiredError,
      OtpInvalidError,
      AccountLockedError,
      UnauthorizedError,
      ForbiddenError,
    ];
    for (const Ctor of errors) {
      const err = new Ctor();
      expect(err.userMessage).toBeTruthy();
      expect(err.userMessage.length).toBeGreaterThan(0);
    }
  });

  it('metadata is passed through and frozen', () => {
    const err = new InvalidCredentialsError({ userId: 'u1', attempt: 3 });
    expect(err.metadata.userId).toBe('u1');
    expect(() => {
      (err.metadata as Record<string, unknown>).userId = 'u2';
    }).toThrow();
  });
});
