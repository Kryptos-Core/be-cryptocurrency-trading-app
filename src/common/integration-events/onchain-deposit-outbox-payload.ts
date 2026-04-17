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
