import type { BlockchainNetwork } from '@/common/enums';

/** What we settle against in [DepositFxService] (native coin vs tokenized USDT). */
export type DepositSettlementAsset = 'NATIVE' | 'USDT_TRC20' | 'USDT_ERC20';

/**
 * One creditable inbound leg of an on-chain tx (native or token transfer to the platform deposit address).
 * Used by manual submit, auto-watcher, and settlement refresh.
 */
export interface ResolvedDepositTransfer {
  chain: BlockchainNetwork;
  txHash: string;
  /** EVM log index when multiple Transfer events share one tx hash; Tron uses 0. */
  logIndex: number;
  from: string;
  to: string;
  amountHuman: string;
  asset: DepositSettlementAsset;
  chainStatus: 'PENDING' | 'CONFIRMED' | 'FAILED' | 'NOT_FOUND';
  confirmations: number;
  blockNumber?: number;
}

export interface ResolveDepositTransfersContext {
  /** Platform deposit address for this chain (from managed wallets / deposit methods). */
  expectedDepositAddress: string;
}
