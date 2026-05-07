import { EVM_CHAIN_DEFINITIONS } from '@/common/constants/evm-chain-definitions';
import { ConfigCategory, ConfigDataType } from '@/entities/system-config.entity';

export interface RuntimeSettingSeed {
  key: string;
  type: ConfigDataType;
  category: ConfigCategory;
  name: string;
  description: string;
  isReadOnly?: boolean;
}

/** Core + finance keys (non-EVM-dynamic). */
const BASE_RUNTIME_SETTING_SEEDS: RuntimeSettingSeed[] = [
  {
    key: 'WALLET_SYNC_INTERVAL',
    type: ConfigDataType.INTEGER,
    category: ConfigCategory.CORE,
    name: 'Wallet sync interval (ms)',
    description: 'Interval for wallet sync workers (milliseconds).',
  },
  {
    key: 'WALLET_RECONCILIATION_THRESHOLD',
    type: ConfigDataType.STRING,
    category: ConfigCategory.FINANCE,
    name: 'Reconciliation discrepancy threshold',
    description: 'Absolute balance discrepancy treated as acceptable for reconciliation.',
  },
  {
    key: 'TRON_MAINNET_FULL_HOST',
    type: ConfigDataType.STRING,
    category: ConfigCategory.TECH,
    name: 'Tron mainnet RPC URL',
    description: 'Full node HTTP API for Tron mainnet (TRC-20).',
  },
  {
    key: 'SOLANA_MAINNET_URL',
    type: ConfigDataType.STRING,
    category: ConfigCategory.TECH,
    name: 'Solana mainnet RPC URL',
    description: 'JSON RPC endpoint for Solana mainnet-beta (SPL).',
  },
  {
    key: 'ETH_MAINNET_RPC_URL',
    type: ConfigDataType.STRING,
    category: ConfigCategory.TECH,
    name: 'Ethereum mainnet RPC URL',
    description: 'JSON-RPC URL for Ethereum mainnet (EVM / MetaMask).',
  },
  {
    key: 'ETH_MAINNET_CHAIN_ID',
    type: ConfigDataType.INTEGER,
    category: ConfigCategory.TECH,
    name: 'Ethereum mainnet chain ID',
    description: 'EIP-155 chain ID for Ethereum mainnet (typically 1).',
  },
  {
    key: 'BSC_MAINNET_RPC_URL',
    type: ConfigDataType.STRING,
    category: ConfigCategory.TECH,
    name: 'BSC mainnet RPC URL',
    description: 'JSON-RPC URL for BNB Smart Chain mainnet (EVM / MetaMask).',
  },
  {
    key: 'BSC_MAINNET_CHAIN_ID',
    type: ConfigDataType.INTEGER,
    category: ConfigCategory.TECH,
    name: 'BSC mainnet chain ID',
    description: 'EIP-155 chain ID for BSC (typically 56).',
  },
  {
    key: 'BLOCKCHAIN_ALLOW_TEST_SIGNATURE',
    type: ConfigDataType.BOOLEAN,
    category: ConfigCategory.CORE,
    name: 'Allow test signature bypass',
    description:
      'When true (non-production rules apply), linking may accept TEST_SIG:: payloads. Editing from UI is blocked in production unless ALLOW_UI_TEST_SIGNATURE=true.',
  },
  {
    key: 'BLOCKCHAIN_WITHDRAW_AUTO_MAX',
    type: ConfigDataType.STRING,
    category: ConfigCategory.FINANCE,
    name: 'Global auto-approve withdraw max (native)',
    description: 'Default max native amount for auto-processed withdrawals.',
  },
  {
    key: 'BLOCKCHAIN_WITHDRAW_AUTO_MAX_ETH_MAINNET',
    type: ConfigDataType.STRING,
    category: ConfigCategory.FINANCE,
    name: 'Auto max withdraw — Ethereum mainnet',
    description: 'Per-chain cap for ETH_MAINNET; falls back to global when empty.',
  },
  {
    key: 'BLOCKCHAIN_WITHDRAW_AUTO_MAX_BSC_MAINNET',
    type: ConfigDataType.STRING,
    category: ConfigCategory.FINANCE,
    name: 'Auto max withdraw — BSC mainnet',
    description: 'Per-chain cap for BSC_MAINNET; falls back to global when empty.',
  },
  {
    key: 'BLOCKCHAIN_WITHDRAW_AUTO_MAX_SOLANA_MAINNET',
    type: ConfigDataType.STRING,
    category: ConfigCategory.FINANCE,
    name: 'Auto max withdraw — Solana mainnet',
    description: 'Per-chain cap for SOLANA_MAINNET; falls back to global when empty.',
  },
  {
    key: 'BLOCKCHAIN_WITHDRAW_AUTO_MAX_TRON_MAINNET',
    type: ConfigDataType.STRING,
    category: ConfigCategory.FINANCE,
    name: 'Auto max withdraw — Tron mainnet',
    description: 'Per-chain cap for TRON_MAINNET; falls back to global when empty.',
  },
  {
    key: 'BLOCKCHAIN_WITHDRAW_ETH_SYMBOL',
    type: ConfigDataType.STRING,
    category: ConfigCategory.CORE,
    name: 'Withdraw symbol — Ethereum',
    description: 'Currency symbol used for ETH-family chains (must exist in DB).',
  },
  {
    key: 'BLOCKCHAIN_WITHDRAW_BNB_SYMBOL',
    type: ConfigDataType.STRING,
    category: ConfigCategory.CORE,
    name: 'Withdraw symbol — BNB',
    description: 'Currency symbol for BSC native (must exist in DB).',
  },
  {
    key: 'BLOCKCHAIN_WITHDRAW_SOL_SYMBOL',
    type: ConfigDataType.STRING,
    category: ConfigCategory.CORE,
    name: 'Withdraw symbol — Solana',
    description: 'Currency symbol used for Solana mainnet withdrawals.',
  },
  {
    key: 'BLOCKCHAIN_WITHDRAW_TRON_SYMBOL',
    type: ConfigDataType.STRING,
    category: ConfigCategory.CORE,
    name: 'Withdraw symbol — Tron',
    description: 'Currency symbol used for Tron withdrawals (e.g. TRX).',
  },
  {
    key: 'BLOCKCHAIN_WITHDRAW_POL_SYMBOL',
    type: ConfigDataType.STRING,
    category: ConfigCategory.CORE,
    name: 'Withdraw symbol — Polygon POL',
    description: 'Currency symbol for Polygon native (must exist in DB).',
  },
  {
    key: 'BLOCKCHAIN_WITHDRAW_AVAX_SYMBOL',
    type: ConfigDataType.STRING,
    category: ConfigCategory.CORE,
    name: 'Withdraw symbol — Avalanche',
    description: 'Currency symbol for Avalanche C-Chain native (must exist in DB).',
  },
  {
    key: 'BLOCKCHAIN_WITHDRAW_XDAI_SYMBOL',
    type: ConfigDataType.STRING,
    category: ConfigCategory.CORE,
    name: 'Withdraw symbol — Gnosis xDAI',
    description: 'Currency symbol for Gnosis Chain native (must exist in DB).',
  },
  {
    key: 'BLOCKCHAIN_WITHDRAW_FTM_SYMBOL',
    type: ConfigDataType.STRING,
    category: ConfigCategory.CORE,
    name: 'Withdraw symbol — Fantom',
    description: 'Currency symbol for Fantom native (must exist in DB).',
  },
  {
    key: 'PLATFORM_CASH_CURRENCY_SYMBOL',
    type: ConfigDataType.STRING,
    category: ConfigCategory.FINANCE,
    name: 'Platform cash symbol',
    description: 'Internal ledger symbol for cash leg of deposits (typically USDT).',
  },
  {
    key: 'BLOCKCHAIN_DEPOSIT_TRX_TO_USDT_RATE',
    type: ConfigDataType.FLOAT,
    category: ConfigCategory.FINANCE,
    name: 'Fallback rate TRX → USDT',
    description: 'Used when price oracle unavailable; 1 TRX = X USDT.',
  },
  {
    key: 'BLOCKCHAIN_DEPOSIT_ETH_TO_USDT_RATE',
    type: ConfigDataType.FLOAT,
    category: ConfigCategory.FINANCE,
    name: 'Fallback rate ETH → USDT',
    description: 'Used when price oracle unavailable.',
  },
  {
    key: 'BLOCKCHAIN_DEPOSIT_SOL_TO_USDT_RATE',
    type: ConfigDataType.FLOAT,
    category: ConfigCategory.FINANCE,
    name: 'Fallback rate SOL → USDT',
    description: 'Used when price oracle unavailable.',
  },
  {
    key: 'BLOCKCHAIN_DEPOSIT_POL_TO_USDT_RATE',
    type: ConfigDataType.FLOAT,
    category: ConfigCategory.FINANCE,
    name: 'Fallback rate POL → USDT',
    description: 'Used when price oracle unavailable.',
  },
  {
    key: 'BLOCKCHAIN_DEPOSIT_AVAX_TO_USDT_RATE',
    type: ConfigDataType.FLOAT,
    category: ConfigCategory.FINANCE,
    name: 'Fallback rate AVAX → USDT',
    description: 'Used when price oracle unavailable.',
  },
  {
    key: 'BLOCKCHAIN_DEPOSIT_XDAI_TO_USDT_RATE',
    type: ConfigDataType.FLOAT,
    category: ConfigCategory.FINANCE,
    name: 'Fallback rate XDAI → USDT',
    description: 'Used when price oracle unavailable.',
  },
  {
    key: 'BLOCKCHAIN_DEPOSIT_FTM_TO_USDT_RATE',
    type: ConfigDataType.FLOAT,
    category: ConfigCategory.FINANCE,
    name: 'Fallback rate FTM → USDT',
    description: 'Used when price oracle unavailable.',
  },
  {
    key: 'MM_DEFAULT_SPREAD_BPS',
    type: ConfigDataType.INTEGER,
    category: ConfigCategory.FINANCE,
    name: 'Market maker default spread (bps)',
    description: 'Default spread_bps for new MM config rows (form empty state).',
  },
  {
    key: 'MM_DEFAULT_SPREAD_ALERT_THRESHOLD_BPS',
    type: ConfigDataType.INTEGER,
    category: ConfigCategory.FINANCE,
    name: 'Market maker default spread alert (bps)',
    description: 'Default spread_alert_threshold_bps for new MM config.',
  },
  {
    key: 'MM_DEFAULT_ORDER_AMOUNT',
    type: ConfigDataType.STRING,
    category: ConfigCategory.FINANCE,
    name: 'Market maker default order amount',
    description: 'Default order_amount string for new MM config (per pair).',
  },
  {
    key: 'MARKET_READ_SOURCE',
    type: ConfigDataType.STRING,
    category: ConfigCategory.CORE,
    name: 'Market read source',
    description: 'Select read source for market APIs: postgres|timescale.',
  },
  {
    key: 'TICKER_SOURCE',
    type: ConfigDataType.STRING,
    category: ConfigCategory.CORE,
    name: 'Ticker source',
    description: 'Select ticker publisher source: nestjs|go_aggregator.',
  },
  {
    key: 'MATCHING_ENGINE',
    type: ConfigDataType.STRING,
    category: ConfigCategory.CORE,
    name: 'Matching engine mode',
    description: 'Matching mode: ts|go_shadow|go_canary|go.',
  },
  {
    key: 'MATCHING_GO_CANARY_PAIRS',
    type: ConfigDataType.STRING,
    category: ConfigCategory.CORE,
    name: 'Go matching canary pairs',
    description: 'Comma-separated pair_id allowlist for go_canary shadow/canary routing.',
  },
  {
    key: 'PUBLIC_WS_SOURCE',
    type: ConfigDataType.STRING,
    category: ConfigCategory.CORE,
    name: 'Public WS source',
    description: 'Public market websocket source: nestjs|go.',
  },
  {
    key: 'GO_AGGREGATOR_TICKER_CHANNEL',
    type: ConfigDataType.STRING,
    category: ConfigCategory.CORE,
    name: 'Go aggregator ticker channel',
    description: 'Redis pub/sub channel used for external Go ticker ingress.',
  },
  {
    key: 'GO_AGGREGATOR_OHLC_CHANNEL',
    type: ConfigDataType.STRING,
    category: ConfigCategory.CORE,
    name: 'Go aggregator OHLC channel',
    description: 'Redis pub/sub channel used for external Go OHLC ingress.',
  },
  {
    key: 'MATCHING_SHADOW_MONITOR_PAIRS',
    type: ConfigDataType.STRING,
    category: ConfigCategory.CORE,
    name: 'Matching shadow monitor pairs',
    description: 'Comma-separated pair_id list to collect scheduled shadow parity metrics.',
  },
  {
    key: 'MATCHING_SHADOW_ALERT_MIN_MATCH_RATE_PERCENT',
    type: ConfigDataType.FLOAT,
    category: ConfigCategory.CORE,
    name: 'Matching shadow min match rate alert',
    description: 'Raise ops warning when shadow parity drops below this percent.',
  },
  {
    key: 'MATCHING_SHADOW_ALERT_MAX_UNMATCHED_RUNS',
    type: ConfigDataType.INTEGER,
    category: ConfigCategory.CORE,
    name: 'Matching shadow max unmatched runs alert',
    description: 'Raise ops warning when unmatched shadow runs exceed this threshold.',
  },
  {
    key: 'GO_ROLLOUT_WINDOW_HOURS',
    type: ConfigDataType.INTEGER,
    category: ConfigCategory.CORE,
    name: 'Go rollout readiness window (hours)',
    description: 'Window size in hours used by go rollout readiness checks.',
  },
  {
    key: 'GO_ROLLOUT_MAX_PUBLIC_WS_DRIFT_PAIRS',
    type: ConfigDataType.INTEGER,
    category: ConfigCategory.CORE,
    name: 'Go rollout max public WS drift pairs',
    description: 'Maximum allowed drift pair count before rollout readiness fails.',
  },
  {
    key: 'EVENT_OUTBOX_ALERT_MAX_DEAD_LETTER_ROWS',
    type: ConfigDataType.INTEGER,
    category: ConfigCategory.CORE,
    name: 'Outbox alert max dead-letter rows',
    description:
      'Alert threshold: dead-letter row count above this value marks outbox relay degraded.',
  },
  {
    key: 'EVENT_OUTBOX_ALERT_MAX_OLDEST_UNPUBLISHED_AGE_SECONDS',
    type: ConfigDataType.INTEGER,
    category: ConfigCategory.CORE,
    name: 'Outbox alert max oldest unpublished age (seconds)',
    description:
      'Alert threshold: oldest unpublished outbox row age in seconds before degraded signal.',
  },
  {
    key: 'EVENT_OUTBOX_ALERT_MAX_OLDEST_DEAD_LETTER_AGE_SECONDS',
    type: ConfigDataType.INTEGER,
    category: ConfigCategory.CORE,
    name: 'Outbox alert max oldest dead-letter age (seconds)',
    description:
      'Alert threshold: oldest dead-letter outbox row age in seconds before degraded signal.',
  },
];

function buildEvmRpcSeeds(baseKeys: Set<string>): RuntimeSettingSeed[] {
  return EVM_CHAIN_DEFINITIONS.filter((d) => !baseKeys.has(d.rpcConfigKey)).map((d) => ({
    key: d.rpcConfigKey,
    type: ConfigDataType.STRING,
    category: ConfigCategory.TECH,
    name: `${d.network} RPC URL`,
    description: `JSON-RPC for ${d.treasuryChain} (chainId ${d.chainId}); mirrors env ${d.rpcConfigKey}.`,
  }));
}

function buildEvmWithdrawAutoMaxSeeds(existingKeys: Set<string>): RuntimeSettingSeed[] {
  return EVM_CHAIN_DEFINITIONS.map((d) => `BLOCKCHAIN_WITHDRAW_AUTO_MAX_${d.treasuryChain}`)
    .filter((k) => !existingKeys.has(k))
    .map((key) => ({
      key,
      type: ConfigDataType.STRING,
      category: ConfigCategory.FINANCE,
      name: `Auto max withdraw — ${key.replace('BLOCKCHAIN_WITHDRAW_AUTO_MAX_', '')}`,
      description: 'Per-chain cap; falls back to BLOCKCHAIN_WITHDRAW_AUTO_MAX when empty.',
    }));
}

const baseKeySet = new Set(BASE_RUNTIME_SETTING_SEEDS.map((s) => s.key));
const evmRpcSeeds = buildEvmRpcSeeds(baseKeySet);
const afterRpcKeys = new Set([...baseKeySet, ...evmRpcSeeds.map((s) => s.key)]);
const evmAutoMaxSeeds = buildEvmWithdrawAutoMaxSeeds(afterRpcKeys);
const EXTRA_OUTBOX_RUNTIME_SETTING_SEEDS: RuntimeSettingSeed[] = [
  {
    key: 'EVENT_OUTBOX_ALERT_CRITICAL_MAX_DEAD_LETTER_ROWS',
    type: ConfigDataType.INTEGER,
    category: ConfigCategory.CORE,
    name: 'Outbox critical max dead-letter rows',
    description:
      'Critical threshold: dead-letter row count above this value marks outbox relay critical.',
  },
  {
    key: 'EVENT_OUTBOX_ALERT_CRITICAL_MAX_OLDEST_UNPUBLISHED_AGE_SECONDS',
    type: ConfigDataType.INTEGER,
    category: ConfigCategory.CORE,
    name: 'Outbox critical max oldest unpublished age (seconds)',
    description:
      'Critical threshold: oldest unpublished outbox row age in seconds before critical signal.',
  },
  {
    key: 'EVENT_OUTBOX_ALERT_CRITICAL_MAX_OLDEST_DEAD_LETTER_AGE_SECONDS',
    type: ConfigDataType.INTEGER,
    category: ConfigCategory.CORE,
    name: 'Outbox critical max oldest dead-letter age (seconds)',
    description:
      'Critical threshold: oldest dead-letter outbox row age in seconds before critical signal.',
  },
  {
    key: 'EVENT_OUTBOX_ALERT_AUTOMATION_ENABLED',
    type: ConfigDataType.BOOLEAN,
    category: ConfigCategory.CORE,
    name: 'Outbox alert automation enabled',
    description: 'Enables scheduled outbox degraded/critical alert automation collector.',
  },
  {
    key: 'EVENT_OUTBOX_ALERTS_CHANNEL',
    type: ConfigDataType.STRING,
    category: ConfigCategory.CORE,
    name: 'Outbox alerts pubsub channel',
    description: 'Redis pub/sub channel for outbox relay alert state-change events.',
  },
];

const EXTRA_MARKET_READ_RUNTIME_SETTING_SEEDS: RuntimeSettingSeed[] = [
  {
    key: 'MARKET_READ_MODEL_ALERT_MAX_LAG_SECONDS',
    type: ConfigDataType.INTEGER,
    category: ConfigCategory.CORE,
    name: 'Market read model max lag alert (seconds)',
    description: 'Alert threshold: market read model lag in seconds before degraded signal.',
  },
  {
    key: 'MARKET_READ_MODEL_ALERT_CRITICAL_MAX_LAG_SECONDS',
    type: ConfigDataType.INTEGER,
    category: ConfigCategory.CORE,
    name: 'Market read model critical max lag (seconds)',
    description: 'Critical threshold: market read model lag in seconds before critical signal.',
  },
];

const EXTRA_GO_ROLLOUT_RUNTIME_SETTING_SEEDS: RuntimeSettingSeed[] = [
  {
    key: 'GO_ROLLOUT_MIN_PUBLIC_WS_COMPARED_PAIRS',
    type: ConfigDataType.INTEGER,
    category: ConfigCategory.CORE,
    name: 'Go rollout min compared pairs',
    description:
      'Minimum number of pairs that must have WS parity data before readiness check passes.',
  },
  {
    key: 'GO_ROLLOUT_ROLLBACK_DRILL_MAX_AGE_HOURS',
    type: ConfigDataType.INTEGER,
    category: ConfigCategory.CORE,
    name: 'Go rollback drill max age (hours)',
    description: 'Maximum age in hours for a rollback drill to be considered valid.',
  },
];

const EXTRA_FINANCE_RUNTIME_SETTING_SEEDS: RuntimeSettingSeed[] = [
  {
    key: 'BLOCKCHAIN_WITHDRAW_AUTO_MIN_AMOUNT',
    type: ConfigDataType.STRING,
    category: ConfigCategory.FINANCE,
    name: 'Global auto-approve withdraw min (native)',
    description:
      'Minimum native amount for auto-processed withdrawals. Amounts below this require manual review.',
  },
  {
    key: 'BLOCKCHAIN_DEPOSIT_BSC_TO_USDT_RATE',
    type: ConfigDataType.FLOAT,
    category: ConfigCategory.FINANCE,
    name: 'Fallback rate BSC → USDT',
    description: 'Used when price oracle unavailable; 1 BNB = X USDT.',
  },
];

/** Full seed list: core + every `*_RPC_URL` from evm-chain-definitions + per-chain auto max (no duplicates). */
export const RUNTIME_SETTING_SEEDS: RuntimeSettingSeed[] = [
  ...BASE_RUNTIME_SETTING_SEEDS,
  ...evmRpcSeeds,
  ...evmAutoMaxSeeds,
  ...EXTRA_OUTBOX_RUNTIME_SETTING_SEEDS,
  ...EXTRA_MARKET_READ_RUNTIME_SETTING_SEEDS,
  ...EXTRA_GO_ROLLOUT_RUNTIME_SETTING_SEEDS,
  ...EXTRA_FINANCE_RUNTIME_SETTING_SEEDS,
];

/** Whitelisted keys manageable via UI / runtime settings (mirror .env names). */
export const RUNTIME_SETTING_KEYS = RUNTIME_SETTING_SEEDS.map((s) => s.key);

export type RuntimeSettingKey = (typeof RUNTIME_SETTING_KEYS)[number];

export const RUNTIME_SETTING_KEY_SET = new Set<string>(RUNTIME_SETTING_KEYS);
