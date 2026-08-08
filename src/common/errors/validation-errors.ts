import { DomainError } from '../domain-error.base';

/**
 * VALIDATION/SCHEMA_INVALID - 422
 */
export class SchemaValidationError extends DomainError {
  public readonly fieldErrors: ReadonlyArray<{ path: string; message: string }>;

  constructor(
    fieldErrors: Array<{ path: string; message: string }>,
    metadata?: Record<string, unknown>,
    cause?: unknown,
  ) {
    super({
      code: 'VALIDATION/SCHEMA_INVALID',
      httpStatus: 422,
      userMessage: 'One or more fields are invalid.',
      internalMessage: 'Schema validation failed.',
      metadata: { ...metadata, fieldErrors },
      cause,
    });
    this.fieldErrors = Object.freeze([...fieldErrors]);
  }
}

/**
 * VALIDATION/REQUIRED_FIELD_MISSING - 400
 */
export class RequiredFieldMissingError extends DomainError {
  constructor(field: string, metadata?: Record<string, unknown>, cause?: unknown) {
    super({
      code: 'VALIDATION/REQUIRED_FIELD_MISSING',
      httpStatus: 400,
      userMessage: `Required field "${field}" is missing.`,
      internalMessage: `Field "${field}" required.`,
      metadata: { ...metadata, field },
      cause,
    });
  }
}
