import type { OrderValidationContext } from '@/modules/orders/strategies/order-validation.strategy';

export interface PreparedCreateOrderContext {
  validationContext: OrderValidationContext;
  slippageTolerance: string | null;
  marketBuyReservedQuote: string | null;
}
