import { DomainError } from './domain-error.base';

/**
 * RESOURCE/NOT_FOUND - 404
 */
export class ResourceNotFoundError extends DomainError {
  constructor(resource: string, id?: string, metadata?: Record<string, unknown>, cause?: unknown) {
    super({
      code: 'RESOURCE/NOT_FOUND',
      httpStatus: 404,
      userMessage: `${resource}${id ? ` (${id})` : ''} was not found.`,
      internalMessage: `Resource ${resource}${id ? ` (${id})` : ''} not found.`,
      metadata: { ...metadata, resource, id },
      cause,
    });
  }
}

/**
 * RESOURCE/CONFLICT - 409
 */
export class ResourceConflictError extends DomainError {
  constructor(resource: string, metadata?: Record<string, unknown>, cause?: unknown) {
    super({
      code: 'RESOURCE/CONFLICT',
      httpStatus: 409,
      userMessage: `${resource} already exists or conflicts with current state.`,
      internalMessage: `Resource ${resource} conflict.`,
      metadata: { ...metadata, resource },
      cause,
    });
  }
}

/**
 * RESOURCE/RATE_LIMITED - 429
 */
export class RateLimitedError extends DomainError {
  constructor(retryAfterSeconds: number, metadata?: Record<string, unknown>, cause?: unknown) {
    super({
      code: 'RESOURCE/RATE_LIMITED',
      httpStatus: 429,
      userMessage: 'Too many requests. Please try again later.',
      internalMessage: 'Rate limit triggered.',
      metadata: { ...metadata, retryAfterSeconds },
      cause,
    });
  }
}

/**
 * INTERNAL/UNEXPECTED - 500
 */
export class UnexpectedError extends DomainError {
  constructor(metadata?: Record<string, unknown>, cause?: unknown) {
    super({
      code: 'INTERNAL/UNEXPECTED',
      httpStatus: 500,
      userMessage: 'An unexpected error occurred. Please try again.',
      internalMessage: 'Unexpected error.',
      metadata,
      cause,
    });
  }
}

/**
 * INTERNAL/EXTERNAL_SERVICE - 502
 */
export class ExternalServiceError extends DomainError {
  constructor(service: string, metadata?: Record<string, unknown>, cause?: unknown) {
    super({
      code: 'INTERNAL/EXTERNAL_SERVICE',
      httpStatus: 502,
      userMessage: 'An external service is temporarily unavailable.',
      internalMessage: `External service ${service} failed.`,
      metadata: { ...metadata, service },
      cause,
    });
  }
}
