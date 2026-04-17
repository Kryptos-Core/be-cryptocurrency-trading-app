/** Tron networks where treasury Fund/Sweep may move USDT (TRC-20). */
export type TronTreasuryNetwork = 'TRON_MAINNET' | 'TRON_NILE' | 'TRON_SHASTA';

/** Official USDT (TRC-20) contract per Tron network (6 decimals). */
export const TRON_USDT_CONTRACT: Record<TronTreasuryNetwork, string> = {
  TRON_MAINNET: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
  TRON_NILE: 'TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf',
  TRON_SHASTA: 'TG3XXyExBkPp9nzdajDZsozEu4BkaSJozs',
};

export const TRON_USDT_DECIMALS = 6;

export function isTronTreasuryChain(chain: string): chain is TronTreasuryNetwork {
  return chain === 'TRON_MAINNET' || chain === 'TRON_NILE' || chain === 'TRON_SHASTA';
}
