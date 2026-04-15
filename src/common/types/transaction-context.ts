/**
 * TransactionContext — opaque handle passed between domain ports during
 * a database transaction.
 *
 * The domain layer treats this as an opaque token; infrastructure
 * implementations cast it to the concrete ORM type (e.g. TypeORM
 * EntityManager) internally.
 *
 * This avoids leaking TypeORM types into the domain/application layer
 * while preserving the ability to propagate transactions across repository
 * calls.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface TransactionContext {}
