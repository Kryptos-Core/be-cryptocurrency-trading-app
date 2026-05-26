/**
 * Chain picker lists for admin/treasury UIs — mirrors Flutter
 * `lib/presentation/constants/treasury_chains.dart` (server + `networkCatalog` is source of truth).
 */

import type { ChainNetworkCatalogItemDto } from '@/common/constants/chain-registry';
import { BlockchainNetwork } from '@/common/enums';
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
  | 'onchain_deposit_withdraw'
  /** Treasury E2E config form — chain picker for E2E integration test setup. */
  | 'treasury_e2e';

export interface ChainPickerEnvInput {
  onchainOperatorMode?: string;
  env?: string;
  tronDefaultNetwork?: string;
}

export interface ChainPickerItem {
  code: string;
  /** Pre-computed blockchain label (mainnet name only, no network suffix).
   *  Mirrors Flutter [OnchainChainPickerProvider.displayLabelForCode] logic. */
  blockchainLabel: string;
}

export interface ChainPickerOptionsDto {
  operatorMode: 'sandbox' | 'production';
  /** Effective Tron row for sandbox (TRON_NILE | TRON_SHASTA); in production mode TRON_MAINNET. */
  tronDefaultNetwork: string;
  pickers: Record<ChainPickerContextKey, ChainPickerItem[]>;
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

function chainPickerItem(code: string, mainnetOnly: boolean): ChainPickerItem {
  const network = BlockchainNetwork[code as keyof typeof BlockchainNetwork];
  if (!network) return { code, blockchainLabel: code };
  return { code, blockchainLabel: blockchainLabelMap(network, mainnetOnly) };
}

function blockchainLabelMap(network: BlockchainNetwork, mainnetOnly: boolean): string {
  switch (network) {
    case BlockchainNetwork.TON_MAINNET:
      return 'TON';
    case BlockchainNetwork.TON_TESTNET:
      return mainnetOnly ? 'TON' : 'TON Testnet';
    case BlockchainNetwork.BSC_MAINNET:
      return 'BNB Smart Chain';
    case BlockchainNetwork.BSC_CHAPEL:
      return mainnetOnly ? 'BNB Smart Chain' : 'BNB Smart Chain (Chapel)';
    case BlockchainNetwork.SOLANA_MAINNET:
      return 'Solana';
    case BlockchainNetwork.SOLANA_DEVNET:
      return mainnetOnly ? 'Solana' : 'Solana (devnet)';
    case BlockchainNetwork.ETH_MAINNET:
      return 'Ethereum';
    case BlockchainNetwork.ETH_SEPOLIA:
      return mainnetOnly ? 'Ethereum' : 'Ethereum (Sepolia)';
    case BlockchainNetwork.BASE_MAINNET:
      return 'Base';
    case BlockchainNetwork.BASE_SEPOLIA:
      return mainnetOnly ? 'Base' : 'Base (Sepolia)';
    case BlockchainNetwork.ARBITRUM_MAINNET:
      return 'Arbitrum One';
    case BlockchainNetwork.ARBITRUM_SEPOLIA:
      return mainnetOnly ? 'Arbitrum' : 'Arbitrum (Sepolia)';
    case BlockchainNetwork.OPTIMISM_MAINNET:
      return 'Optimism';
    case BlockchainNetwork.OPTIMISM_SEPOLIA:
      return mainnetOnly ? 'Optimism' : 'Optimism (Sepolia)';
    case BlockchainNetwork.POLYGON_MAINNET:
      return 'Polygon';
    case BlockchainNetwork.POLYGON_AMOY:
      return mainnetOnly ? 'Polygon' : 'Polygon (Amoy)';
    case BlockchainNetwork.AVALANCHE_MAINNET:
      return 'Avalanche';
    case BlockchainNetwork.AVALANCHE_FUJI:
      return mainnetOnly ? 'Avalanche' : 'Avalanche (Fuji)';
    case BlockchainNetwork.GNOSIS_MAINNET:
      return 'Gnosis';
    case BlockchainNetwork.GNOSIS_CHIADO:
      return mainnetOnly ? 'Gnosis' : 'Gnosis (Chiado)';
    case BlockchainNetwork.LINEA_MAINNET:
      return 'Linea';
    case BlockchainNetwork.LINEA_SEPOLIA:
      return mainnetOnly ? 'Linea' : 'Linea (Sepolia)';
    case BlockchainNetwork.FANTOM_MAINNET:
      return 'Fantom';
    case BlockchainNetwork.FANTOM_TESTNET:
      return mainnetOnly ? 'Fantom' : 'Fantom (testnet)';
    case BlockchainNetwork.TRON_MAINNET:
      return 'Tron';
    case BlockchainNetwork.TRON_NILE:
      return mainnetOnly ? 'Tron' : 'Tron (Nile)';
    case BlockchainNetwork.TRON_SHASTA:
      return mainnetOnly ? 'Tron' : 'Tron (Shasta)';
    default:
      return String(network);
  }
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
      treasury_ops: treasuryOpsList.map((c) => chainPickerItem(c, mainnetOnly)),
      treasury_main_wallet: treasuryOpsList.map((c) => chainPickerItem(c, mainnetOnly)),
      treasury_history_filter: treasuryOpsList.map((c) => chainPickerItem(c, mainnetOnly)),
      withdrawal_admin_filter: actionable.map((c) => chainPickerItem(c, mainnetOnly)),
      /** Same universe as [onchain_deposit_withdraw] — admin "Nạp tiền & ví quản lý" vs user deposit tab. */
      managed_wallets: actionable.map((c) => chainPickerItem(c, mainnetOnly)),
      onchain_deposit_withdraw: actionable.map((c) => chainPickerItem(c, mainnetOnly)),
      treasury_e2e: treasuryOpsList.map((c) => chainPickerItem(c, mainnetOnly)),
    },
  };
}
