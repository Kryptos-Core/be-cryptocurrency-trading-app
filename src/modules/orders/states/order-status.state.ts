/**
 * Order status (State Pattern: possible states)
 */
export type OrderStatus =
  | 'OPEN'
  | 'PARTIAL'
  | 'FILLED'
  | 'CANCELLED'
  | 'REJECTED';

const CANCELLABLE_STATUSES: OrderStatus[] = ['OPEN', 'PARTIAL'];

export function canCancelOrder(status: OrderStatus): boolean {
  return CANCELLABLE_STATUSES.includes(status);
}

export function isTerminalStatus(status: OrderStatus): boolean {
  return ['FILLED', 'CANCELLED', 'REJECTED'].includes(status);
}
