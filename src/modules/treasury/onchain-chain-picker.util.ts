/**
 * Chain picker lists for admin/treasury UIs — mirrors Flutter
 * `lib/presentation/constants/treasury_chains.dart` (server + `networkCatalog` is source of truth).
 */

import type { ChainNetworkCatalogItemDto } from '@/common/constants/chain-registry';
import {
  buildNetworkCatalog,
  listActionableOnchainChainCodes,
  listTreasuryOpsChainCodes,
} from '@/common/constants/chain-registry';

export type ChainPickerContextKey =
  | 'treasury_ops'
  | 'treasury_main_wallet'
  | 'treasury_history_filter'
  | 'withdrawal_admin_filter'
  | 'managed_wallets'
  /** User-facing on-chain deposit / withdraw + recent-tx network filters (Flutter tabs). */
  | 'onchain_deposit_withdraw';

export interface ChainPickerEnvInput {
  onchainOperatorMode?: string;
  env?: string;
  tronDefaultNetwork?: string;
}

export interface ChainPickerOptionsDto {
  operatorMode: 'sandbox' | 'production';
  /** Effective Tron row for sandbox (TRON_NILE | TRON_SHASTA); in production mode TRON_MAINNET. */
  tronDefaultNetwork: string;
  pickers: Record<ChainPickerContextKey, string[]>;
  /** Full network sheet (includes TON with capabilities off until Phase 2). */
  networkCatalog: ChainNetworkCatalogItemDto[];
}

const MANAGED_WALLETS_TESTNET = ['TRON_MAINNET', 'TRON_NILE', 'TRON_SHASTA'] as const;

/** Same rule as Flutter [treasuryChainsUseMainnetOnly]. */
export function resolveTreasuryChainsUseMainnetOnly(input: ChainPickerEnvInput): boolean {
  const raw = input.onchainOperatorMode?.trim();
  if (raw != null && raw !== '') {
    return raw.toLowerCase().trim() !== 'sandbox';
  }
  return (input.env ?? '').trim().toLowerCase() === 'production';
}

export function resolveSandboxTronDefaultNetwork(
  tronDefaultNetwork?: string,
): 'TRON_NILE' | 'TRON_SHASTA' {
  const u = tronDefaultNetwork?.trim().toUpperCase();
  if (u === 'TRON_SHASTA') return 'TRON_SHASTA';
  if (u === 'TRON_NILE') return 'TRON_NILE';
  return 'TRON_NILE';
}

function managedWalletsChainsForCurrentEnv(mainnetOnly: boolean): string[] {
  if (mainnetOnly) {
    return ['TRON_MAINNET'];
  }
  return [...MANAGED_WALLETS_TESTNET];
}

/**
 * App setting `deposit.recommended_chain` may still say TRON_MAINNET while
 * ONCHAIN_OPERATOR_MODE=sandbox exposes only testnets in `onchain_deposit_withdraw`.
 * Map to the effective Tron testnet row (or first picker chain) so UI/API stay consistent.
 */
export function resolveRecommendedChainForDepositPicker(
  settingChain: string,
  pickerChains: string[],
  tronDefaultNetwork: string,
): string {
  if (pickerChains.length === 0) return settingChain.trim();
  const s = settingChain.trim();
  if (pickerChains.includes(s)) return s;
  const t = tronDefaultNetwork.trim();
  if (pickerChains.includes(t)) return t;
  return pickerChains[0];
}

export function buildChainPickerOptions(input: ChainPickerEnvInput): ChainPickerOptionsDto {
  const mainnetOnly = resolveTreasuryChainsUseMainnetOnly(input);
  const operatorMode: 'sandbox' | 'production' = mainnetOnly ? 'production' : 'sandbox';
  const sandboxTron = resolveSandboxTronDefaultNetwork(input.tronDefaultNetwork);
  const tronDefaultNetwork = mainnetOnly ? 'TRON_MAINNET' : sandboxTron;

  const actionable = listActionableOnchainChainCodes(mainnetOnly, input.tronDefaultNetwork);
  const treasuryList = listTreasuryOpsChainCodes(mainnetOnly, input.tronDefaultNetwork);
  const catalog = buildNetworkCatalog(mainnetOnly, input.tronDefaultNetwork);

  return {
    operatorMode,
    tronDefaultNetwork,
    networkCatalog: catalog,
    pickers: {
      treasury_ops: [...treasuryList],
      treasury_main_wallet: [...treasuryList],
      treasury_history_filter: [...treasuryList],
      withdrawal_admin_filter: [...actionable],
      managed_wallets: managedWalletsChainsForCurrentEnv(mainnetOnly),
      onchain_deposit_withdraw: [...actionable],
    },
  };
}
