/**
 * @deprecated Import from infrastructure/persistence instead.
 * Kept for backward compatibility — external modules still import OrderRepository from here.
 */
export { OrderRepositoryImpl as OrderRepository } from '../infrastructure/persistence/order.repository.impl';

// Re-export type interfaces from the domain port (old consumers imported them from here)
export type {
  OrderBookLevel,
  CreateOrderProcedureResult,
  CancelOrderProcedureResult,
} from '../domain/ports/order-repository.port';
