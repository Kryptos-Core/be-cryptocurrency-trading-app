/**
 * Static registry of worker pool tasks (Piscina) for ops / documentation alignment.
 * Feature modules register pools via `WorkerPoolModule.forRoot`; this file lists names only.
 */
export const WorkerPoolRegistry = {
  /** Treasury: Ed25519 / secp256k1 key material (see treasury/workers) */
  treasuryCryptoAccount: 'treasury.crypto-account',
  blockchainTxDecode: 'blockchain.tx-decode',
  walletsReportExport: 'wallets.report-export',
  exchangeRateBatchFetch: 'exchange-rate.batch-fetch',
  marketMakerBatchQuote: 'market-maker.batch-quote',
} as const;

export type WorkerPoolTaskName = (typeof WorkerPoolRegistry)[keyof typeof WorkerPoolRegistry];
