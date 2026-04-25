export interface OrderLifecycleOutboxPayloadV1 {
  orderId: string;
  userId: string;
  pairId: string;
  side: 'BUY' | 'SELL';
  type: 'LIMIT' | 'MARKET';
  status: string;
  amount: string;
  filledAmount: string;
  price: string | null;
  timeInForce: string;
  clientOrderId: string | null;
  idempotencyKey: string;
  reservedQuote: string;
  reservedBase: string;
  createdAt: string;
  updatedAt: string;
}

export function isOrderLifecycleOutboxPayloadV1(
  value: unknown,
): value is OrderLifecycleOutboxPayloadV1 {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.orderId === 'string' &&
    typeof candidate.userId === 'string' &&
    typeof candidate.pairId === 'string' &&
    typeof candidate.side === 'string' &&
    typeof candidate.type === 'string' &&
    typeof candidate.status === 'string' &&
    typeof candidate.amount === 'string' &&
    typeof candidate.filledAmount === 'string' &&
    typeof candidate.timeInForce === 'string' &&
    typeof candidate.idempotencyKey === 'string' &&
    typeof candidate.reservedQuote === 'string' &&
    typeof candidate.reservedBase === 'string' &&
    typeof candidate.createdAt === 'string' &&
    typeof candidate.updatedAt === 'string'
  );
}
