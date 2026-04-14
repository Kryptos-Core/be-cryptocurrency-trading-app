import {
  OrderValidationContext,
  OrderValidationService,
  OrderValidationServicePort,
} from '@/modules/orders/domain/services/order-validation.service';

/**
 * Compatibility abstraction for legacy strategy references.
 */
export type IOrderValidationStrategy = OrderValidationServicePort;

/**
 * Compatibility wrapper while callers migrate to OrderValidationService.
 */
export class OrderValidationStrategy extends OrderValidationService {}

export type { OrderValidationContext };
