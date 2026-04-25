export interface WalletBalanceChangedOutboxPayloadV1 {
  userId: string;
  currencyId: string;
  symbol: string;
  available: string;
  frozen: string;
  total: string;
  updatedAt: string;
}

export function isWalletBalanceChangedOutboxPayloadV1(
  value: unknown,
): value is WalletBalanceChangedOutboxPayloadV1 {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.userId === 'string' &&
    typeof candidate.currencyId === 'string' &&
    typeof candidate.symbol === 'string' &&
    typeof candidate.available === 'string' &&
    typeof candidate.frozen === 'string' &&
    typeof candidate.total === 'string' &&
    typeof candidate.updatedAt === 'string'
  );
}
