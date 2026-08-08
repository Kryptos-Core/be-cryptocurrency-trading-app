/**
 * DomainError - Base class for all domain/business errors.
 *
 * Properties are readonly (immutability). Extend this class for specific
 * domain errors. Use HttpException subclasses only at the controller boundary.
 *
 * Rules:
 * - Throw DomainError, never HttpException, inside services.
 * - Map DomainError -> HttpException in a global filter (see filters/).
 * - `code` is a stable string identifier (e.g. "AUTH/INVALID_CREDENTIALS").
 * - `userMessage` is rendered to client; never leak internals.
 * - `internalMessage` is server-side log context.
 * - `metadata` is structured data for logging, never expose to client.
 *
 * @example
 *   throw new InvalidCredentialsError({ userId, attemptCount });
 */
export abstract class DomainError extends Error {
  public readonly code: string;
  public readonly httpStatus: number;
  public readonly userMessage: string;
  public readonly internalMessage: string;
  public readonly metadata: Readonly<Record<string, unknown>>;
  public readonly cause?: unknown;

  protected constructor(params: {
    code: string;
    httpStatus: number;
    userMessage: string;
    internalMessage?: string;
    metadata?: Record<string, unknown>;
    cause?: unknown;
  }) {
    super(params.internalMessage ?? params.userMessage);
    this.name = new.target.name;
    this.code = params.code;
    this.httpStatus = params.httpStatus;
    this.userMessage = params.userMessage;
    this.internalMessage = params.internalMessage ?? params.userMessage;
    this.metadata = Object.freeze({ ...(params.metadata ?? {}) });
    this.cause = params.cause;
    // Preserve prototype chain for instanceof to work after transpilation
    Object.setPrototypeOf(this, new.target.prototype);
  }

  /**
   * Serializes for server-side logging. Never send this to clients.
   */
  toLogJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      httpStatus: this.httpStatus,
      internalMessage: this.internalMessage,
      metadata: this.metadata,
      stack: this.stack,
    };
  }

  /**
   * Returns the safe payload for HTTP response.
   */
  toResponseJSON(): { code: string; message: string } {
    return { code: this.code, message: this.userMessage };
  }
}
