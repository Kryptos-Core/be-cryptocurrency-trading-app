import type { EntityManager } from 'typeorm';
import type { TransactionContext } from '@/common/types/transaction-context';

/**
 * TransactionContext is intentionally opaque to domain code; infrastructure
 * stores the active TypeORM EntityManager. This helper is used only in
 * infrastructure / application wiring.
 */
export function getEntityManagerFromTransactionContext(ctx: TransactionContext): EntityManager {
  return ctx as unknown as EntityManager;
}
