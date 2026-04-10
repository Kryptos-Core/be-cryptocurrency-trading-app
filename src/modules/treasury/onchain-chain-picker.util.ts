/**
 * Chain picker lists for admin/treasury UIs — mirrors Flutter
 * `lib/presentation/constants/treasury_chains.dart` (single source of truth on server).
 */

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
}

const TREASURY_OPS_CHAIN_VALUES = [
  'TRON_NILE',
  'TRON_SHASTA',
  'TRON_MAINNET',
  'ETH_MAINNET',
] as const;

const TREASURY_OPS_MAINNET_ONLY = new Set<string>(['TRON_MAINNET', 'ETH_MAINNET']);

const WITHDRAWAL_FILTER_TESTNET = ['TRON_NILE', 'TRON_SHASTA', 'SOLANA_DEVNET', 'BSC_CHAPEL'] as const;

const MANAGED_WALLETS_TESTNET = ['TRON_MAINNET', 'TRON_NILE', 'TRON_SHASTA'] as const;

/** Same rule as Flutter [treasuryChainsUseMainnetOnly]. */
export function resolveTreasuryChainsUseMainnetOnly(input: ChainPickerEnvInput): boolean {
  const raw = input.onchainOperatorMode?.trim();
  if (raw != null && raw !== '') {
    return raw.toLowerCase().trim() !== 'sandbox';
  }
  return (input.env ?? '').trim().toLowerCase() === 'production';
}

export function resolveSandboxTronDefaultNetwork(tronDefaultNetwork?: string): 'TRON_NILE' | 'TRON_SHASTA' {
  const u = tronDefaultNetwork?.trim().toUpperCase();
  if (u === 'TRON_SHASTA') return 'TRON_SHASTA';
  if (u === 'TRON_NILE') return 'TRON_NILE';
  return 'TRON_NILE';
}

function treasuryOpsChainsForCurrentEnv(mainnetOnly: boolean): string[] {
  if (mainnetOnly) {
    return TREASURY_OPS_CHAIN_VALUES.filter((c) => TREASURY_OPS_MAINNET_ONLY.has(c));
  }
  return TREASURY_OPS_CHAIN_VALUES.filter((c) => !TREASURY_OPS_MAINNET_ONLY.has(c));
}

function treasuryOpsWalletCreationChainsForCurrentEnv(
  mainnetOnly: boolean,
  tronDefaultNetwork?: string,
): string[] {
  if (mainnetOnly) {
    return treasuryOpsChainsForCurrentEnv(true);
  }
  return [
    resolveSandboxTronDefaultNetwork(tronDefaultNetwork),
    'SOLANA_DEVNET',
    'BSC_CHAPEL',
  ];
}

function withdrawalFilterChainsForCurrentEnv(mainnetOnly: boolean): string[] {
  if (mainnetOnly) {
    return ['TRON_MAINNET', 'ETH_MAINNET', 'SOLANA_MAINNET'];
  }
  return [...WITHDRAWAL_FILTER_TESTNET];
}

function managedWalletsChainsForCurrentEnv(mainnetOnly: boolean): string[] {
  if (mainnetOnly) {
    return ['TRON_MAINNET'];
  }
  return [...MANAGED_WALLETS_TESTNET];
}

/** EVM + Solana + one Tron row — matches Flutter user on-chain deposit/withdraw pickers. */
function onchainDepositWithdrawChainsForCurrentEnv(
  mainnetOnly: boolean,
  tronDefaultNetwork?: string,
): string[] {
  if (mainnetOnly) {
    return ['ETH_MAINNET', 'BSC_MAINNET', 'SOLANA_MAINNET', 'TRON_MAINNET'];
  }
  return [
    'BSC_CHAPEL',
    'SOLANA_DEVNET',
    resolveSandboxTronDefaultNetwork(tronDefaultNetwork),
  ];
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

  const opsCreation = treasuryOpsWalletCreationChainsForCurrentEnv(mainnetOnly, input.tronDefaultNetwork);

  return {
    operatorMode,
    tronDefaultNetwork,
    pickers: {
      treasury_ops: [...opsCreation],
      treasury_main_wallet: [...opsCreation],
      treasury_history_filter: [...opsCreation],
      withdrawal_admin_filter: withdrawalFilterChainsForCurrentEnv(mainnetOnly),
      managed_wallets: managedWalletsChainsForCurrentEnv(mainnetOnly),
      onchain_deposit_withdraw: onchainDepositWithdrawChainsForCurrentEnv(
        mainnetOnly,
        input.tronDefaultNetwork,
      ),
    },
  };
}
