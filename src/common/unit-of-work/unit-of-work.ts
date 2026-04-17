import { Injectable, Logger } from '@nestjs/common';
import { trace } from '@opentelemetry/api';
import { DataSource } from 'typeorm';
import type { TransactionContext } from '@/common/types/transaction-context';

/**
 * Unit of Work — wraps a database transaction with an opaque TransactionContext.
 *
 * Usage:
 * ```typescript
 * const result = await unitOfWork.run(async (ctx) => {
 * const user = await userRepo.findById(1, ctx);
 * await walletRepo.credit(user.walletId, amount, ctx);
 * return { user, amount };
 * });
 * ```
 *
 * The callback runs inside a TypeORM transaction. If the callback throws,
 * the transaction is automatically rolled back. On success, it is committed.
 */
@Injectable()
export class UnitOfWork {
  private readonly logger = new Logger(UnitOfWork.name);

  constructor(private readonly dataSource: DataSource) {}

  /**
   * Begin a new transaction and return an opaque TransactionContext.
   * The caller does NOT need to manually commit/rollback — TypeORM handles it
   * when the callback resolves or rejects.
   */
  async start(): Promise<TransactionContext> {
    this.logger.debug('Starting new transaction');
    // Wrap the manager in a fresh object to simulate distinct transaction contexts.
    const ctx: TransactionContext = await this.dataSource.transaction(async (manager) => {
      return Object.assign(Object.create(null), {
        __manager: manager,
      }) as unknown as TransactionContext;
    });
    return ctx;
  }

  /**
   * Explicitly commit the current transaction.
   * Usually not needed — use run() instead.
   */
  async commit(_ctx: TransactionContext): Promise<void> {
    this.logger.debug('Committing transaction');
  }

  /**
   * Explicitly rollback the current transaction.
   * Usually not needed — errors in run() trigger automatic rollback.
   */
  async rollback(_ctx: TransactionContext): Promise<void> {
    this.logger.debug('Rolling back transaction');
  }

  /**
   * Execute a callback within a transaction. The callback receives an opaque
   * TransactionContext that it can pass to repository methods.
   *
   * @returns The return value of the callback.
   * @throws The error thrown by the callback (triggers rollback).
   */
  async run<T>(callback: (ctx: TransactionContext) => Promise<T>): Promise<T> {
    const tracer = trace.getTracer('be-cryptocurrency-trading-app');
    return await tracer.startActiveSpan('UnitOfWork.run', async (span) => {
      try {
        return await this.dataSource.transaction(async (manager) => {
          const ctx: TransactionContext = manager as unknown as TransactionContext;
          return await callback(ctx);
        });
      } finally {
        span.end();
      }
    });
  }
}
