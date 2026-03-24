/**
 * Shape tham chiếu từ tài liệu Cas Balance Hook / Webhook (JSON POST).
 * @see https://cas.so/general/api/webhook
 * @see https://cas.so/product/balance-hook
 */
export interface CasWebhookTransactionPayload {
  id?: string;
  transactionCode?: string;
  reference?: string | null;
  transactionDate?: string;
  transactionDateTime?: string;
  bookingDate?: string;
  amount?: number;
  description?: string;
  runningBalance?: number;
  accountNumber?: number | string;
  virtualAccountNumber?: string | null;
  virtualAccountName?: string | null;
  paymentChannel?: string | null;
  counterAccountNumber?: string | null;
  counterAccountName?: string | null;
  counterAccountBankId?: string | null;
  counterAccountBankName?: string | null;
  paymentMeta?: unknown;
  fiId?: string;
  fiName?: string;
  fiServiceId?: string;
  fiServiceName?: string;
  currency?: string;
}

export interface CasWebhookEnvelope {
  environment?: string;
  webhookType?: string;
  webhookCode?: string;
  error?: unknown;
  grantId?: string;
  transaction?: CasWebhookTransactionPayload;
  [key: string]: unknown;
}
