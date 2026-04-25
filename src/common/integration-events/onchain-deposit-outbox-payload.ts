/** Payload shape stored in integration_outbox for deposit events (payloadVersion 1). */
export interface OnchainDepositOutboxPayloadV1 {
  payloadVersion: 1;
  userId: string;
  txId: string;
  chain: string;
  txHash: string;
  status: string;
  amount: string;
  settled: boolean;
  fromAddress: string;
  toAddress: string;
  confirmations: number;
  createdAt: string;
  confirmedAt?: string | null;
  creditedCurrencyId?: string;
  creditedAmount?: string;
  conversionRate?: string;
}

export function isOnchainDepositOutboxPayloadV1(
  value: unknown,
): value is OnchainDepositOutboxPayloadV1 {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    candidate.payloadVersion === 1 &&
    typeof candidate.userId === 'string' &&
    typeof candidate.txId === 'string' &&
    typeof candidate.chain === 'string' &&
    typeof candidate.txHash === 'string' &&
    typeof candidate.status === 'string' &&
    typeof candidate.amount === 'string' &&
    typeof candidate.settled === 'boolean' &&
    typeof candidate.fromAddress === 'string' &&
    typeof candidate.toAddress === 'string' &&
    typeof candidate.confirmations === 'number' &&
    typeof candidate.createdAt === 'string'
  );
}
