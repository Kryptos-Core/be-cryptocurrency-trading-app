/**
 * Chain picker lists for admin/treasury UIs — mirrors Flutter
 * `lib/presentation/constants/treasury_chains.dart` (server + `networkCatalog` is source of truth).
 */

import type { ChainNetworkCatalogItemDto } from '@/common/constants/chain-registry';
import {
  buildNetworkCatalog,
  listActionableOnchainChainCodes,
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

/**
 * Treasury ops / main-wallet / history filters: sandbox lists the same chain universe as
 * user-facing pickers (both Tron testnets in catalog). If the actionable list already
 * contains both Tron rows, no extra insert is applied.
 *
 * (Related: `resolveRecommendedChainForDepositPicker` maps `deposit.recommended_chain`
 * TRON_MAINNET → the configured sandbox Tron row when mainnet codes are absent from pickers.)
 */
export function listTreasuryOpsChainCodes(
  mainnetOnly: boolean,
  tronDefaultNetwork?: string,
): string[] {
  if (mainnetOnly) {
    return listActionableOnchainChainCodes(true, tronDefaultNetwork);
  }
  const base = [...listActionableOnchainChainCodes(false, tronDefaultNetwork)];
  const altTron =
    resolveSandboxTronDefaultNetwork(tronDefaultNetwork) === 'TRON_NILE'
      ? 'TRON_SHASTA'
      : 'TRON_NILE';
  const tronIdx = base.findIndex((c) => c === 'TRON_NILE' || c === 'TRON_SHASTA');
  if (tronIdx >= 0 && !base.includes(altTron)) {
    base.splice(tronIdx + 1, 0, altTron);
  }
  return base;
}

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
  const treasuryOpsList = listTreasuryOpsChainCodes(mainnetOnly, input.tronDefaultNetwork);
  const catalog = buildNetworkCatalog(mainnetOnly, input.tronDefaultNetwork);

  return {
    operatorMode,
    tronDefaultNetwork,
    networkCatalog: catalog,
    pickers: {
      treasury_ops: [...treasuryOpsList],
      treasury_main_wallet: [...treasuryOpsList],
      treasury_history_filter: [...treasuryOpsList],
      withdrawal_admin_filter: [...actionable],
      /** Same universe as [onchain_deposit_withdraw] — admin “Nạp tiền & ví quản lý” vs user deposit tab. */
      managed_wallets: [...actionable],
      onchain_deposit_withdraw: [...actionable],
    },
  };
}
