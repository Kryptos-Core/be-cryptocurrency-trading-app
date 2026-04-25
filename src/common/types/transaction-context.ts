/**
 * TransactionContext — opaque handle passed between domain ports during
 * a database transaction.
 *
 * The domain layer treats this as an opaque token; infrastructure
 * implementations cast it to the concrete ORM type (e.g. TypeORM
 * EntityManager) internally.
 */
export type TransactionContext = object;
