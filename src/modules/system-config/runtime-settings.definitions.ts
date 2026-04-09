import { ConfigCategory, ConfigDataType } from '@/entities/system-config.entity';

/** Whitelisted keys manageable via UI / runtime settings (mirror .env names). */
export const RUNTIME_SETTING_KEYS = [
  'WALLET_SYNC_INTERVAL',
  'WALLET_RECONCILIATION_THRESHOLD',
  'TRON_MAINNET_FULL_HOST',
  'SOLANA_MAINNET_URL',
  'ETH_MAINNET_RPC_URL',
  'ETH_MAINNET_CHAIN_ID',
  'BSC_MAINNET_RPC_URL',
  'BSC_MAINNET_CHAIN_ID',
  'BLOCKCHAIN_ALLOW_TEST_SIGNATURE',
  'BLOCKCHAIN_WITHDRAW_AUTO_MAX',
  'BLOCKCHAIN_WITHDRAW_AUTO_MAX_ETH_MAINNET',
  'BLOCKCHAIN_WITHDRAW_AUTO_MAX_BSC_MAINNET',
  'BLOCKCHAIN_WITHDRAW_AUTO_MAX_SOLANA_MAINNET',
  'BLOCKCHAIN_WITHDRAW_AUTO_MAX_TRON_MAINNET',
  'BLOCKCHAIN_WITHDRAW_ETH_SYMBOL',
  'BLOCKCHAIN_WITHDRAW_SOL_SYMBOL',
  'BLOCKCHAIN_WITHDRAW_TRON_SYMBOL',
  'PLATFORM_CASH_CURRENCY_SYMBOL',
  'BLOCKCHAIN_DEPOSIT_TRX_TO_USDT_RATE',
  'BLOCKCHAIN_DEPOSIT_ETH_TO_USDT_RATE',
  'BLOCKCHAIN_DEPOSIT_SOL_TO_USDT_RATE',
] as const;

export type RuntimeSettingKey = (typeof RUNTIME_SETTING_KEYS)[number];

export const RUNTIME_SETTING_KEY_SET = new Set<string>(RUNTIME_SETTING_KEYS);

export interface RuntimeSettingSeed {
  key: RuntimeSettingKey;
  type: ConfigDataType;
  category: ConfigCategory;
  name: string;
  description: string;
  isReadOnly?: boolean;
}

export const RUNTIME_SETTING_SEEDS: RuntimeSettingSeed[] = [
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
];
