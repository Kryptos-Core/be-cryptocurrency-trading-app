/**
 * Custom Exception Class - Base for all application exceptions
 * Apply----- Single Responsibility Principle (SRP)
 */
export class AppException extends Error {
  constructor(
    public readonly code: string,
    public readonly message: string,
    public readonly statusCode: number = 400,
    public readonly context?: Record<string, any>,
  ) {
    super(message);
    Object.setPrototypeOf(this, AppException.prototype);
  }
}

/**
 * Business Logic Exception
 */
export class BusinessException extends AppException {
  constructor(message: string, code: string = 'BUSINESS_ERROR', context?: Record<string, any>) {
    super(code, message, 400, context);
    Object.setPrototypeOf(this, BusinessException.prototype);
  }
}

/**
 * Resource Not Found Exception
 */
export class NotFoundException extends AppException {
  constructor(resource: string, identifier?: string | number) {
    const message = identifier ? `${resource} with id ${identifier} not found` : `${resource} not found`;
    super('NOT_FOUND', message, 404);
    Object.setPrototypeOf(this, NotFoundException.prototype);
  }
}

/**
 * Unauthorized Exception
 */
export class UnauthorizedException extends AppException {
  constructor(message: string = 'Unauthorized') {
    super('UNAUTHORIZED', message, 401);
    Object.setPrototypeOf(this, UnauthorizedException.prototype);
  }
}

/**
 * Forbidden Exception
 */
export class ForbiddenException extends AppException {
  constructor(message: string = 'Forbidden') {
    super('FORBIDDEN', message, 403);
    Object.setPrototypeOf(this, ForbiddenException.prototype);
  }
}

/**
 * Validation Exception
 */
export class ValidationException extends AppException {
  constructor(message: string, errors?: Record<string, any>) {
    super('VALIDATION_ERROR', message, 422, errors);
    Object.setPrototypeOf(this, ValidationException.prototype);
  }
}

/**
 * Conflict Exception (Duplicate resource)
 */
export class ConflictException extends AppException {
  constructor(message: string, code: string = 'CONFLICT') {
    super(code, message, 409);
    Object.setPrototypeOf(this, ConflictException.prototype);
  }
}

/**
 * Internal Server Exception
 */
export class InternalServerException extends AppException {
  constructor(message: string = 'Internal server error', context?: Record<string, any>) {
    super('INTERNAL_SERVER_ERROR', message, 500, context);
    Object.setPrototypeOf(this, InternalServerException.prototype);
  }
}
