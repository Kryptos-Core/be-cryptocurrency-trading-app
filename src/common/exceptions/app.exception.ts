/**
 * Custom Exception Class - Base for all application exceptions
 * Apply----- Single Responsibility Principle (SRP)
 */
export class AppException extends Error {
  constructor(
    public readonly message: string,
    public readonly code: string,
    public readonly statusCode: number = 400,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    Object.setPrototypeOf(this, AppException.prototype);
  }
}

/**
 * Bad Request Exception (400)
 * For invalid client requests
 */
export class BadRequestException extends AppException {
  constructor(message: string, code: string = 'BAD_REQUEST', context?: Record<string, unknown>) {
    super(message, code, 400, context);
    Object.setPrototypeOf(this, BadRequestException.prototype);
  }
}

/**
 * Business Logic Exception
 */
export class BusinessException extends AppException {
  constructor(message: string, code: string = 'BUSINESS_ERROR', context?: Record<string, unknown>) {
    super(message, code, 400, context);
    Object.setPrototypeOf(this, BusinessException.prototype);
  }
}

/** Redis per-wallet treasury lock held by another fund/sweep job — processor should defer, not fail. */
export class TreasuryWalletBusyException extends BusinessException {
  constructor(context?: Record<string, unknown>) {
    super('Treasury wallet is busy with another operation', 'TREASURY_WALLET_BUSY', context);
    Object.setPrototypeOf(this, TreasuryWalletBusyException.prototype);
  }
}

/**
 * Resource Not Found Exception
 *
 * Accepts three forms:
 *   - `NotFoundException('Resource not found')` — 1-arg, message-only,
 *     code defaults to `'NOT_FOUND'`.
 *   - `NotFoundException('Resource', 'userId')` — legacy (resource, id),
 *     message becomes `"<resource> with id <id> not found"`, code is
 *     `'NOT_FOUND'`. The id is rendered into the message so the FE sees a
 *     human-readable error.
 *   - `NotFoundException('', 'CUSTOM_CODE')` — new typed-descriptor form,
 *     code is what the caller passes, message is empty (the global filter
 *     re-renders the message from `messages.ts` keyed by the code).
 *     Detection rule: first arg is empty *and* second arg is a string.
 */
export class NotFoundException extends AppException {
  constructor(resourceOrMessage: string, identifierOrCode?: string | number) {
    const isTypedDescriptor =
      resourceOrMessage === '' &&
      typeof identifierOrCode === 'string' &&
      identifierOrCode !== '';
    const isLegacyResource = !isTypedDescriptor && typeof identifierOrCode === 'string';
    const message = isTypedDescriptor
      ? ''
      : isLegacyResource
        ? `${resourceOrMessage} with id ${identifierOrCode} not found`
        : resourceOrMessage;
    const code = isTypedDescriptor
      ? (identifierOrCode as string)
      : 'NOT_FOUND';
    super(message, code, 404);
    Object.setPrototypeOf(this, NotFoundException.prototype);
  }
}

/**
 * Unauthorized Exception
 */
export class UnauthorizedException extends AppException {
  constructor(message: string = 'Unauthorized') {
    super(message, 'UNAUTHORIZED', 401);
    Object.setPrototypeOf(this, UnauthorizedException.prototype);
  }
}

/**
 * Forbidden Exception
 *
 * Accepts either:
 *   - `ForbiddenException('message')` — legacy, code is fixed to 'FORBIDDEN'.
 *   - `ForbiddenException('message', 'CUSTOM_CODE')` — used by the typed
 *     descriptors to surface fine-grained codes (e.g. `ADMIN_REQUIRED`)
 *     while keeping the 403 status code.
 */
export class ForbiddenException extends AppException {
  constructor(message: string = 'Forbidden', code: string = 'FORBIDDEN') {
    super(message, code, 403);
    Object.setPrototypeOf(this, ForbiddenException.prototype);
  }
}

/**
 * Validation Exception
 */
export class ValidationException extends AppException {
  constructor(
    message: string,
    codeOrContext?: string | Record<string, unknown>,
    context?: Record<string, unknown>,
  ) {
    // Support both old: ValidationException('msg', {field:'x'}) and new: ValidationException('msg', 'CODE', ctx)
    const isOldSignature = typeof codeOrContext === 'object' || codeOrContext === undefined;
    const code = isOldSignature ? 'VALIDATION_ERROR' : (codeOrContext as string);
    const ctx = isOldSignature ? codeOrContext as Record<string, unknown> | undefined : context;
    super(message, code, 422, ctx);
    Object.setPrototypeOf(this, ValidationException.prototype);
  }
}

/**
 * Conflict Exception (Duplicate resource)
 *
 * Accepts either:
 *   - `ConflictException('message', 'CODE')` — legacy, no context.
 *   - `ConflictException('message', 'CODE', { extra })` — typed-descriptor form,
 *     context is forwarded to the filter so `translateError` can interpolate
 *     variables (e.g. `{count}` in `WITHDRAWAL_PENDING_EXISTS`).
 */
export class ConflictException extends AppException {
  constructor(message: string, code: string = 'CONFLICT', context?: Record<string, unknown>) {
    super(message, code, 409, context);
    Object.setPrototypeOf(this, ConflictException.prototype);
  }
}

/**
 * Internal Server Exception
 */
export class InternalServerException extends AppException {
  constructor(
    message: string = 'Internal server error',
    codeOrContext?: string | Record<string, unknown>,
    context?: Record<string, unknown>,
  ) {
    // Support both old: InternalServerException('msg', {code:'X'}) and new: InternalServerException('msg', 'CODE')
    const isOldSignature = typeof codeOrContext === 'object' || codeOrContext === undefined;
    const code = isOldSignature ? 'INTERNAL_SERVER_ERROR' : (codeOrContext as string);
    const ctx = isOldSignature ? codeOrContext as Record<string, unknown> | undefined : context;
    super(message, code, 500, ctx);
    Object.setPrototypeOf(this, InternalServerException.prototype);
  }
}

/**
 * Service Unavailable (503) - e.g. external API rate limit (Binance IP ban)
 */
export class ServiceUnavailableException extends AppException {
  constructor(
    message: string,
    code: string = 'SERVICE_UNAVAILABLE',
    context?: Record<string, unknown>,
  ) {
    super(message, code, 503, context);
    Object.setPrototypeOf(this, ServiceUnavailableException.prototype);
  }
}
