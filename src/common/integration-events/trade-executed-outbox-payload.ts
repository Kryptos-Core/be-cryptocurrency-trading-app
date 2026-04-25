export interface TradeExecutedOutboxPayloadV1 {
  tradeId: string;
  pairId: string;
  makerOrderId: string;
  takerOrderId: string;
  price: string;
  amount: string;
  makerFee: string;
  takerFee: string;
  feeCurrencyId: string;
  executedAt: string;
}

export function isTradeExecutedOutboxPayloadV1(
  value: unknown,
): value is TradeExecutedOutboxPayloadV1 {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.tradeId === 'string' &&
    typeof candidate.pairId === 'string' &&
    typeof candidate.makerOrderId === 'string' &&
    typeof candidate.takerOrderId === 'string' &&
    typeof candidate.price === 'string' &&
    typeof candidate.amount === 'string' &&
    typeof candidate.makerFee === 'string' &&
    typeof candidate.takerFee === 'string' &&
    typeof candidate.feeCurrencyId === 'string' &&
    typeof candidate.executedAt === 'string'
  );
}
