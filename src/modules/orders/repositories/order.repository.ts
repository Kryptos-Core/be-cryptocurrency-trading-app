/**
 * @deprecated Import from infrastructure/persistence instead.
 * Kept for backward compatibility — external modules still import OrderRepository from here.
 */

// Re-export type interfaces from the domain port (old consumers imported them from here)
export type {
  CancelOrderProcedureResult,
  CreateOrderProcedureResult,
  OrderBookLevel,
} from '../domain/ports/order-repository.port';
export { OrderRepositoryImpl as OrderRepository } from '../infrastructure/persistence/order.repository.impl';
