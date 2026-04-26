/**
 * Global Enums & Type Definitions
 * Centralized location for all domain enums across modules
 */

// ============================================
// Order Module Enums
// ============================================

/** Order side: BUY or SELL */
export enum OrderSide {
  BUY = 'BUY',
  SELL = 'SELL',
}

/** Order type: LIMIT or MARKET */
export enum OrderType {
  LIMIT = 'LIMIT',
  MARKET = 'MARKET',
}

/** Order status lifecycle */
export enum OrderStatus {
  OPEN = 'OPEN',
  PARTIAL = 'PARTIAL',
  FILLED = 'FILLED',
  CANCELLED = 'CANCELLED',
  REJECTED = 'REJECTED',
}

/** Order time in force: GTC (Good Till Cancel), IOC (Immediate Or Cancel), FOK (Fill Or Kill) */
export enum OrderTimeInForce {
  GTC = 'GTC',
  IOC = 'IOC',
  FOK = 'FOK',
}

// ============================================
// User Module Enums
// ============================================

/** User account status */
export enum UserStatus {
  ACTIVE = 'ACTIVE',
  BANNED = 'BANNED',
  PENDING = 'PENDING',
}

/** User role model for RBAC (không có GUEST — khách = client chưa JWT; không có VERIFIED_USER — KYC: users.identity_verified; inbox OTP: users.email_verified). */
export enum UserRole {
  TRADER = 'TRADER',
  ADMIN = 'ADMIN',
  RISK_OFFICER = 'RISK_OFFICER',
  SUPPORT_AGENT = 'SUPPORT_AGENT',
  MARKET_MAKER = 'MARKET_MAKER',
  /** Manages payment gateway credentials, hot wallet keys, and network settings via UI */
  FINANCE_MANAGER = 'FINANCE_MANAGER',
}

/** Permission key format: resource:action */
export enum Permission {
  USERS_READ = 'users:read',
  USERS_MANAGE = 'users:manage',
  USERS_SECURITY_REVIEW = 'users:security_review',
  CURRENCIES_MANAGE = 'currencies:manage',
  MARKETS_MANAGE = 'markets:manage',
  /** Admin/Ops: inspect market read-model reconciliation, lag, and projection health */
  MARKET_READ_MODEL_OBSERVE = 'market_read_model:observe',
  EXCHANGE_SYNC = 'exchange:sync',
  ORDERS_PLACE = 'orders:place',
  ORDERS_CANCEL = 'orders:cancel',
  // WALLETS
  WALLETS_READ = 'wallets:read',
  WALLETS_MANAGE = 'wallets:manage',
  WALLETS_WITHDRAW = 'wallets:withdraw',
  // ORDERS
  ORDERS_READ = 'orders:read',
  ORDERS_MANAGE = 'orders:manage',
  /** Ops: POST reconcile matching for a pair (manual recovery, admin/risk). */
  MATCHING_RECONCILE = 'matching:reconcile',
  /** Ops: inspect go-shadow parity and drift artifacts. */
  MATCHING_SHADOW_OBSERVE = 'matching:shadow_observe',
  ORDERS_BATCH_PLACE = 'orders:batch_place',
  MARKET_MAKER_CONFIG = 'market_maker:config',
  MARKET_MAKER_DASHBOARD = 'market_maker:dashboard',
  RISK_REVIEW = 'risk:review',
  SUPPORT_CASES = 'support:cases',
  NOTIFICATIONS_BROADCAST = 'notifications:broadcast',
  /** Admin/Ops: inspect, replay, and requeue integration outbox dead-letter rows */
  OUTBOX_MANAGE = 'outbox:manage',
  /** Manage payment gateway configs: PayOS credentials, blockchain hot wallet keys, network settings */
  PAYMENT_CONFIGS_MANAGE = 'payment_configs:manage',
  /** Manage treasury E2E runner configs and health thresholds */
  TREASURY_E2E_CONFIGS_MANAGE = 'treasury_e2e_configs:manage',
  /** Approve or reject withdrawal requests (manual review queue) */
  WITHDRAWALS_APPROVE = 'withdrawals:approve',
  /** Admin: force-ingest deposits, manage UNMATCHED records */
  DEPOSITS_MANAGE = 'deposits:manage',
}

// ============================================
// Deposit Module Enums
// ============================================

/** Deposit status lifecycle */
export enum DepositStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  CREDITED = 'CREDITED',
  FAILED = 'FAILED',
}

// ============================================
// Withdrawal Module Enums
// ============================================

/** Withdrawal status lifecycle */
export enum WithdrawalStatus {
  REQUESTED = 'REQUESTED',
  APPROVED = 'APPROVED',
  SENT = 'SENT',
  COMPLETED = 'COMPLETED',
  REJECTED = 'REJECTED',
  FAILED = 'FAILED',
}

// ============================================
// Wallet Module Enums
// ============================================

/** Wallet transaction action types */
export enum WalletTransactionAction {
  CREDIT = 'CREDIT',
  DEBIT = 'DEBIT',
  FREEZE = 'FREEZE',
  UNFREEZE = 'UNFREEZE',
  TRANSFER = 'TRANSFER',
  SYNC_EXTERNAL = 'SYNC_EXTERNAL',
  RECONCILE = 'RECONCILE',
}

/** Wallet transaction reference types for audit trail */
export enum WalletReferenceType {
  DEPOSIT = 'DEPOSIT',
  WITHDRAW = 'WITHDRAW',
  ORDER = 'ORDER',
  TRADE = 'TRADE',
  ADJUST = 'ADJUST',
  TRANSFER = 'TRANSFER',
  EXTERNAL_DEPOSIT = 'EXTERNAL_DEPOSIT',
  EXTERNAL_WITHDRAWAL = 'EXTERNAL_WITHDRAWAL',
  EXTERNAL_SYNC = 'EXTERNAL_SYNC',
  RECONCILIATION = 'RECONCILIATION',
}

/** Wallet ledger entry direction - Double-entry accounting */
export enum WalletLedgerDirection {
  CREDIT = 'CREDIT',
  DEBIT = 'DEBIT',
}

// ============================================
// Configuration Enums
// ============================================

/** Application environment */
export enum Environment {
  Development = 'development',
  Staging = 'staging',
  Production = 'production',
  Test = 'test',
}

// ============================================
// Blockchain Module Enums
// ============================================

/**
 * On-chain networks (DB + API). Mainnets + canonical sandbox per family.
 * TRON_SHASTA kept for legacy rows / advanced ops; UI resolver uses TRON_NILE for sandbox.
 */
export enum BlockchainNetwork {
  TRON_MAINNET = 'TRON_MAINNET',
  TRON_NILE = 'TRON_NILE',
  TRON_SHASTA = 'TRON_SHASTA',
  SOLANA_MAINNET = 'SOLANA_MAINNET',
  SOLANA_DEVNET = 'SOLANA_DEVNET',
  ETH_MAINNET = 'ETH_MAINNET',
  ETH_SEPOLIA = 'ETH_SEPOLIA',
  BSC_MAINNET = 'BSC_MAINNET',
  BSC_CHAPEL = 'BSC_CHAPEL',
  BASE_MAINNET = 'BASE_MAINNET',
  BASE_SEPOLIA = 'BASE_SEPOLIA',
  ARBITRUM_MAINNET = 'ARBITRUM_MAINNET',
  ARBITRUM_SEPOLIA = 'ARBITRUM_SEPOLIA',
  OPTIMISM_MAINNET = 'OPTIMISM_MAINNET',
  OPTIMISM_SEPOLIA = 'OPTIMISM_SEPOLIA',
  POLYGON_MAINNET = 'POLYGON_MAINNET',
  POLYGON_AMOY = 'POLYGON_AMOY',
  AVALANCHE_MAINNET = 'AVALANCHE_MAINNET',
  AVALANCHE_FUJI = 'AVALANCHE_FUJI',
  GNOSIS_MAINNET = 'GNOSIS_MAINNET',
  GNOSIS_CHIADO = 'GNOSIS_CHIADO',
  LINEA_MAINNET = 'LINEA_MAINNET',
  LINEA_SEPOLIA = 'LINEA_SEPOLIA',
  FANTOM_MAINNET = 'FANTOM_MAINNET',
  FANTOM_TESTNET = 'FANTOM_TESTNET',
  TON_MAINNET = 'TON_MAINNET',
  TON_TESTNET = 'TON_TESTNET',
}

/** Deployment-wide on-chain stack: production mainnets vs sandbox testnets (see ONCHAIN_OPERATOR_MODE). */
export enum OnChainOperatorMode {
  PRODUCTION = 'production',
  SANDBOX = 'sandbox',
}

/** Operator / UI network family — resolved to concrete BlockchainNetwork with mode. */
export enum OnChainNetworkFamily {
  TRON = 'TRON',
  EVM_ETH = 'EVM_ETH',
  EVM_BSC = 'EVM_BSC',
  SOLANA = 'SOLANA',
  /** Phase 2: TonConnect / TON SDK — not wired to WalletConnect EVM relay. */
  TON = 'TON',
}

/** Trạng thái liên kết ví */
export enum LinkedWalletStatus {
  PENDING = 'PENDING',
  VERIFIED = 'VERIFIED',
  REVOKED = 'REVOKED',
}

/** Loại giao dịch on-chain */
export enum OnchainTxType {
  DEPOSIT = 'DEPOSIT',
  WITHDRAWAL = 'WITHDRAWAL',
  TRANSFER = 'TRANSFER',
  SWEEP = 'SWEEP',
  FUND = 'FUND',
}

/** Trạng thái giao dịch on-chain */
export enum OnchainTxStatus {
  UNMATCHED = 'UNMATCHED',
  PENDING = 'PENDING',
  CONFIRMING = 'CONFIRMING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}



