/**
 * CQS / CQRS — Base types for Commands, Queries, and their handlers.
 *
 * Commands represent an intent to change state (write operations).
 * Queries represent a request for data (read operations).
 *
 * This is a lightweight CQS layer — it does NOT require @nestjs/cqrs.
 * Use-cases implement ICommandHandler<C, R> or IQueryHandler<Q, R>
 * and are injected directly into controllers.
 *
 * Upgrade path:
 * If full CQRS with CommandBus/QueryBus is needed later, swap:
 *   ICommandHandler → @nestjs/cqrs CommandHandler
 *   IQueryHandler  → @nestjs/cqrs QueryHandler
 */

// ── Command ────────────────────────────────────────────────────────────────

/**
 * Base class for all commands.
 * A command carries the intent and data needed to perform one state mutation.
 *
 * @example
 * ```typescript
 * export class CreateOrderCommand extends BaseCommand {
 *   constructor(
 *     public readonly userId: string,
 *     public readonly pairId: string,
 *     public readonly amount: string,
 *   ) { super(); }
 * }
 * ```
 */
export abstract class BaseCommand {
  /**
   * Unique correlation ID for tracing across async boundaries.
   * Defaults to a timestamp-based identifier.
   */
  public readonly correlationId: string;

  constructor(correlationId?: string) {
    this.correlationId = correlationId ?? `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  }
}

/**
 * Interface for command handlers (use-cases that mutate state).
 *
 * @typeParam C - The command type this handler processes.
 * @typeParam R - The return type of the handler.
 */
export interface ICommandHandler<C extends BaseCommand, R = void> {
  execute(command: C): Promise<R>;
}

// ── Query ──────────────────────────────────────────────────────────────────

/**
 * Base class for all queries.
 * A query carries the parameters needed to retrieve data without side effects.
 *
 * @example
 * ```typescript
 * export class GetOrdersByUserQuery extends BaseQuery {
 *   constructor(
 *     public readonly userId: string,
 *     public readonly page: number,
 *     public readonly limit: number,
 *   ) { super(); }
 * }
 * ```
 */
export abstract class BaseQuery {
  /**
   * Unique correlation ID for request tracing.
   */
  public readonly correlationId: string;

  constructor(correlationId?: string) {
    this.correlationId = correlationId ?? `qry-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  }
}

/**
 * Interface for query handlers (read-only use-cases).
 *
 * @typeParam Q - The query type this handler processes.
 * @typeParam R - The return type of the handler.
 */
export interface IQueryHandler<Q extends BaseQuery, R> {
  execute(query: Q): Promise<R>;
}
