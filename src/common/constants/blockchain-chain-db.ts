/**
 * MySQL ENUM values for `chain` columns — keep in sync with migrations.
 */
export const BLOCKCHAIN_CHAIN_DB_VALUES = [
  'TRON_NILE',
  'TRON_SHASTA',
  'TRON_MAINNET',
  'SOLANA_DEVNET',
  'SOLANA_MAINNET',
  'ETH_MAINNET',
  'BSC_CHAPEL',
  'BSC_MAINNET',
] as const;

export type BlockchainChainDbValue = (typeof BLOCKCHAIN_CHAIN_DB_VALUES)[number];
