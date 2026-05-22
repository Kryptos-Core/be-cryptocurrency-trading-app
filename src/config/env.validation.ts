import { plainToInstance } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPort,
  IsString,
  IsUrl,
  Max,
  Min,
  validateSync,
} from 'class-validator';
import { Environment } from '@/common/enums';

/**
 * Environment Variables Schema
 * Validation với class-validator
 * Singleton Pattern: Single validation instance
 */
export class EnvironmentVariables {
  // App Configuration
  @IsEnum(Environment)
  @IsOptional()
  NODE_ENV?: Environment = Environment.Development;

  @IsInt()
  @Min(1)
  @Max(65535)
  @IsOptional()
  PORT?: number = 3000;

  @IsString()
  @IsNotEmpty()
  APP_NAME?: string = 'Cryptocurrency Trading API';

  // Database Configuration
  @IsString()
  @IsOptional()
  DB_HOST?: string;

  @IsPort()
  @IsOptional()
  DB_PORT?: string;

  @IsString()
  @IsOptional()
  DB_USERNAME?: string;

  @IsString()
  @IsOptional()
  DB_PASSWORD?: string;

  @IsString()
  @IsOptional()
  DB_NAME?: string;

  @IsString()
  @IsOptional()
  CORE_DB_SOURCE?: string = 'postgres';

  @IsString()
  @IsOptional()
  CORE_DB_TYPE?: string = 'postgres';

  @IsString()
  @IsOptional()
  CORE_DB_HOST?: string;

  @IsPort()
  @IsOptional()
  CORE_DB_PORT?: string;

  @IsString()
  @IsOptional()
  CORE_DB_USERNAME?: string;

  @IsString()
  @IsOptional()
  CORE_DB_PASSWORD?: string;

  @IsString()
  @IsOptional()
  CORE_DB_NAME?: string;

  @IsString()
  @IsOptional()
  MARKET_READ_SOURCE?: string = 'postgres';

  @IsString()
  @IsOptional()
  MARKET_TS_ENABLED?: string = 'false';

  @IsString()
  @IsOptional()
  MARKET_TS_DRIVER?: string = 'postgres';

  @IsString()
  @IsOptional()
  MARKET_TS_TIMESCALE_ENABLED?: string = 'false';

  @IsString()
  @IsOptional()
  MARKET_TS_RETENTION_ENABLED?: string = 'false';

  @IsString()
  @IsOptional()
  MARKET_TS_RETENTION_DAYS?: string = '30';

  @IsString()
  @IsOptional()
  MARKET_TS_COMPRESSION_ENABLED?: string = 'false';

  @IsString()
  @IsOptional()
  MARKET_TS_COMPRESS_AFTER_DAYS?: string = '7';

  @IsString()
  @IsOptional()
  MARKET_TS_HOST?: string;

  @IsPort()
  @IsOptional()
  MARKET_TS_PORT?: string;

  @IsString()
  @IsOptional()
  MARKET_TS_USERNAME?: string;

  @IsString()
  @IsOptional()
  MARKET_TS_PASSWORD?: string;

  @IsString()
  @IsOptional()
  MARKET_TS_DB?: string;

  @IsString()
  @IsOptional()
  ANALYTICS_ENABLED?: string = 'false';

  @IsString()
  @IsOptional()
  CLICKHOUSE_URL?: string;

  @IsString()
  @IsOptional()
  CLICKHOUSE_USER?: string;

  @IsString()
  @IsOptional()
  CLICKHOUSE_PASSWORD?: string;

  @IsString()
  @IsOptional()
  CLICKHOUSE_DB?: string;

  @IsString()
  @IsOptional()
  EVENT_OUTBOX_ENABLED?: string = 'true';

  @IsString()
  @IsOptional()
  EVENT_SCHEMA_FORMAT?: string = 'json';

  @IsString()
  @IsOptional()
  EVENT_PUBLISHER_DRIVER?: string = 'noop';

  @IsString()
  @IsOptional()
  EVENT_OUTBOX_MAX_ATTEMPTS?: string = '5';

  @IsString()
  @IsOptional()
  EVENT_OUTBOX_RETRY_BASE_MS?: string = '1000';

  @IsString()
  @IsOptional()
  EVENT_OUTBOX_ALERT_MAX_DEAD_LETTER_ROWS?: string = '0';

  @IsString()
  @IsOptional()
  EVENT_OUTBOX_ALERT_MAX_OLDEST_UNPUBLISHED_AGE_SECONDS?: string = '300';

  @IsString()
  @IsOptional()
  EVENT_OUTBOX_ALERT_MAX_OLDEST_DEAD_LETTER_AGE_SECONDS?: string = '60';

  @IsString()
  @IsOptional()
  EVENT_OUTBOX_ALERT_CRITICAL_MAX_DEAD_LETTER_ROWS?: string = '10';

  @IsString()
  @IsOptional()
  EVENT_OUTBOX_ALERT_CRITICAL_MAX_OLDEST_UNPUBLISHED_AGE_SECONDS?: string = '1800';

  @IsString()
  @IsOptional()
  EVENT_OUTBOX_ALERT_CRITICAL_MAX_OLDEST_DEAD_LETTER_AGE_SECONDS?: string = '600';

  @IsString()
  @IsOptional()
  EVENT_OUTBOX_ALERT_AUTOMATION_ENABLED?: string = 'true';

  @IsString()
  @IsOptional()
  EVENT_OUTBOX_ALERTS_CHANNEL?: string = 'outbox:alerts';

  @IsString()
  @IsOptional()
  KAFKA_DLQ_TOPIC_ENABLED?: string = 'true';

  @IsString()
  @IsOptional()
  KAFKA_REQUEST_TIMEOUT_MS?: string = '30000';

  @IsString()
  @IsOptional()
  KAFKA_CONNECTION_TIMEOUT_MS?: string = '10000';

  @IsString()
  @IsOptional()
  KAFKA_BROKERS?: string;

  @IsString()
  @IsOptional()
  KAFKA_CLIENT_ID?: string;

  @IsString()
  @IsOptional()
  KAFKA_TOPIC_PREFIX?: string;

  @IsString()
  @IsOptional()
  TICKER_SOURCE?: string = 'nestjs';

  @IsString()
  @IsOptional()
  MATCHING_ENGINE?: string = 'ts';

  @IsString()
  @IsOptional()
  MATCHING_GO_CANARY_PAIRS?: string;

  @IsString()
  @IsOptional()
  PUBLIC_WS_SOURCE?: string = 'nestjs';

  @IsString()
  @IsOptional()
  GO_AGGREGATOR_TICKER_CHANNEL?: string = 'trading:external:ticker';

  @IsString()
  @IsOptional()
  GO_AGGREGATOR_OHLC_CHANNEL?: string = 'trading:external:ohlc';

  @IsString()
  @IsOptional()
  MATCHING_SHADOW_MONITOR_PAIRS?: string;

  @IsString()
  @IsOptional()
  MATCHING_SHADOW_ALERT_MIN_MATCH_RATE_PERCENT?: string = '99.9';

  @IsString()
  @IsOptional()
  MATCHING_SHADOW_ALERT_MAX_UNMATCHED_RUNS?: string = '0';

  @IsString()
  @IsOptional()
  GO_ROLLOUT_WINDOW_HOURS?: string = '24';

  @IsString()
  @IsOptional()
  GO_ROLLOUT_MAX_PUBLIC_WS_DRIFT_PAIRS?: string = '0';

  @IsString()
  @IsOptional()
  GO_ROLLOUT_MIN_PUBLIC_WS_COMPARED_PAIRS?: string = '1';

  @IsString()
  @IsOptional()
  GO_ROLLOUT_ROLLBACK_DRILL_MAX_AGE_HOURS?: string = '72';

  @IsString()
  @IsOptional()
  MARKET_READ_MODEL_ALERT_MAX_LAG_SECONDS?: string = '300';

  @IsString()
  @IsOptional()
  MARKET_READ_MODEL_ALERT_CRITICAL_MAX_LAG_SECONDS?: string = '900';

  /**
   * When true/1/yes/on: log SQL queries via TypeORM. Ignored when NODE_ENV=production.
   */
  @IsString()
  @IsOptional()
  TYPEORM_DEBUG_SQL?: string;

  /**
   * When true/1/yes: GET /markets list uses read_market_pairs projection when filters are simple.
   */
  @IsString()
  @IsOptional()
  READ_MARKETS_FROM_PROJECTION?: string;

  /**
   * When true/1/yes/on: user on-chain transaction list merges DEPOSIT rows from read_onchain_deposits with other types from onchain_transactions.
   */
  @IsString()
  @IsOptional()
  READ_MODEL_ONCHAIN_DEPOSITS?: string;

  @IsString()
  @IsOptional()
  MM_DEFAULT_SPREAD_BPS?: string;

  @IsString()
  @IsOptional()
  MM_DEFAULT_SPREAD_ALERT_THRESHOLD_BPS?: string;

  @IsString()
  @IsOptional()
  MM_DEFAULT_ORDER_AMOUNT?: string;

  // Redis Configuration
  @IsString()
  @IsOptional()
  REDIS_HOST?: string = 'localhost';

  @IsInt()
  @Min(1)
  @Max(65535)
  @IsOptional()
  REDIS_PORT?: number = 6379;

  @IsString()
  @IsOptional()
  REDIS_PASSWORD?: string;

  @IsInt()
  @Min(0)
  @Max(15)
  @IsOptional()
  REDIS_DB?: number = 0;

  /**
   * When true/1/yes: reload order book from DB on every match (reduces stale in-memory book if multiple workers run matching).
   * Default off. Bull consumer uses concurrency 1 per job name; prefer a single matching worker in production.
   */
  @IsString()
  @IsOptional()
  MATCHING_BOOK_FULL_REFRESH?: string;

  // JWT Configuration
  @IsString()
  @IsNotEmpty()
  JWT_SECRET!: string;

  @IsString()
  @IsOptional()
  JWT_EXPIRATION?: string = '24h';

  @IsString()
  @IsOptional()
  JWT_REFRESH_SECRET?: string;

  @IsString()
  @IsOptional()
  JWT_REFRESH_EXPIRATION?: string = '7d';

  // CORS Configuration
  @IsString()
  @IsOptional()
  CORS_ORIGIN?: string = '*';

  @IsBoolean()
  @IsOptional()
  CORS_CREDENTIALS?: boolean = true;

  // Logging Configuration
  @IsBoolean()
  @IsOptional()
  LOG_ENABLED?: boolean = true;

  @IsEnum(['error', 'warn', 'info', 'debug', 'verbose'])
  @IsOptional()
  LOG_LEVEL?: 'error' | 'warn' | 'info' | 'debug' | 'verbose' = 'info';

  // Rate Limiting
  @IsInt()
  @Min(1)
  @IsOptional()
  RATE_LIMIT_TTL?: number = 60; // seconds

  @IsInt()
  @Min(1)
  @IsOptional()
  RATE_LIMIT_MAX?: number = 100; // requests per TTL

  // Security
  @IsInt()
  @Min(1)
  @IsOptional()
  BCRYPT_ROUNDS?: number = 10;

  @IsString()
  @IsOptional()
  API_KEY?: string;

  // External Services (optional)
  @IsUrl()
  @IsOptional()
  EXTERNAL_API_URL?: string;

  @IsString()
  @IsOptional()
  EXTERNAL_API_KEY?: string;

  // Trading Configuration
  @IsEnum(['testnet', 'mainnet'])
  @IsOptional()
  TRADING_ENVIRONMENT?: string = 'testnet';

  @IsEnum(['binance', 'mock'])
  @IsOptional()
  EXCHANGE_MODE?: string = 'mock';

  /** Mock exchange: Decimal-parseable balance returned by getBalance (default 10000). */
  @IsString()
  @IsOptional()
  MOCK_EXCHANGE_BALANCE?: string;

  /** Mock exchange: Decimal-parseable price in getOrderStatus (default 50000). */
  @IsString()
  @IsOptional()
  MOCK_EXCHANGE_ORDER_STATUS_PRICE?: string;

  /** Optional path to seed users JSON (absolute or relative to process cwd). Seed script only. */
  @IsString()
  @IsOptional()
  SEED_USERS_JSON?: string;

  // Binance Testnet Configuration
  @IsBoolean()
  @IsOptional()
  BINANCE_TESTNET_ENABLED?: boolean = false;

  @IsString()
  @IsOptional()
  BINANCE_TESTNET_API_KEY?: string;

  @IsString()
  @IsOptional()
  BINANCE_TESTNET_API_SECRET?: string;

  @IsUrl()
  @IsOptional()
  BINANCE_TESTNET_BASE_URL?: string = 'https://testnet.binancefutures.com';

  // Binance Mainnet Configuration
  @IsString()
  @IsOptional()
  BINANCE_MAINNET_API_KEY?: string;

  @IsString()
  @IsOptional()
  BINANCE_MAINNET_API_SECRET?: string;

  @IsUrl()
  @IsOptional()
  BINANCE_MAINNET_BASE_URL?: string = 'https://fapi.binance.com';

  // Wallet Sync Configuration
  @IsInt()
  @Min(1000)
  @Max(300000)
  @IsOptional()
  WALLET_SYNC_INTERVAL?: number = 30000; // 30 seconds

  @IsString()
  @IsOptional()
  WALLET_RECONCILIATION_THRESHOLD?: string = '0.00000001';

  @IsString()
  @IsOptional()
  WALLET_ENCRYPTION_KEY?: string;

  // Hot Wallet Configuration
  // NOTE: ETH_HOT_WALLET_PRIVATE_KEY and TRON_HOT_WALLET_PRIVATE_KEY removed.
  // Private keys are now managed via treasury_main_wallets table (DB).
  // Use POST /treasury/main-wallets (requires MFA + Risk Officer approval).

  @IsBoolean()
  @IsOptional()
  BLOCKCHAIN_ALLOW_TEST_SIGNATURE?: boolean = false;

  /** When true, production allows PATCH of BLOCKCHAIN_ALLOW_TEST_SIGNATURE via admin API (high risk). */
  @IsBoolean()
  @IsOptional()
  ALLOW_UI_TEST_SIGNATURE?: boolean = false;

  @IsString()
  @IsOptional()
  BLOCKCHAIN_WITHDRAW_AUTO_MAX?: string = '0';

  @IsString()
  @IsOptional()
  BLOCKCHAIN_WITHDRAW_AUTO_MAX_ETH_MAINNET?: string;

  @IsString()
  @IsOptional()
  BLOCKCHAIN_WITHDRAW_AUTO_MAX_BSC_MAINNET?: string;

  @IsString()
  @IsOptional()
  BLOCKCHAIN_WITHDRAW_AUTO_MAX_SOLANA_MAINNET?: string;

  @IsString()
  @IsOptional()
  BLOCKCHAIN_WITHDRAW_AUTO_MAX_TRON_MAINNET?: string;

  @IsString()
  @IsOptional()
  BLOCKCHAIN_WITHDRAW_ETH_SYMBOL?: string = 'ETH';

  @IsString()
  @IsOptional()
  BLOCKCHAIN_WITHDRAW_SOL_SYMBOL?: string = 'SOL';

  @IsString()
  @IsOptional()
  BLOCKCHAIN_WITHDRAW_TRON_SYMBOL?: string = 'TRX';

  @IsUrl()
  @IsOptional()
  TRON_MAINNET_FULL_HOST?: string;

  @IsUrl()
  @IsOptional()
  SOLANA_MAINNET_URL?: string;

  @IsUrl()
  @IsOptional()
  ETH_MAINNET_RPC_URL?: string;

  @IsInt()
  @IsOptional()
  ETH_MAINNET_CHAIN_ID?: number;

  @IsUrl()
  @IsOptional()
  BSC_MAINNET_RPC_URL?: string;

  @IsInt()
  @IsOptional()
  BSC_MAINNET_CHAIN_ID?: number;

  /**
   * On-chain stack: production = mainnets only in resolver; sandbox = testnets (requires sandbox RPC URLs below).
   * Independent of PayOS sandbox vs production accounts.
   */
  @IsIn(['production', 'sandbox'])
  @IsOptional()
  ONCHAIN_OPERATOR_MODE?: string = 'production';

  @IsString()
  @IsOptional()
  TRON_GRID_API_KEY?: string;

  @IsUrl()
  @IsOptional()
  TRON_NILE_FULL_HOST?: string;

  @IsUrl()
  @IsOptional()
  TRON_SHASTA_FULL_HOST?: string;

  @IsUrl()
  @IsOptional()
  SOLANA_DEVNET_URL?: string;

  @IsUrl()
  @IsOptional()
  BSC_CHAPEL_RPC_URL?: string;

  @IsInt()
  @IsOptional()
  BSC_CHAPEL_CHAIN_ID?: number;

  /** EVM RPC URLs (optional; also overridable via system_configs / defaultRpcUrl in evm-chain-definitions). */
  @IsUrl()
  @IsOptional()
  ETH_SEPOLIA_RPC_URL?: string;

  @IsUrl()
  @IsOptional()
  BASE_MAINNET_RPC_URL?: string;

  @IsUrl()
  @IsOptional()
  BASE_SEPOLIA_RPC_URL?: string;

  @IsUrl()
  @IsOptional()
  ARBITRUM_MAINNET_RPC_URL?: string;

  @IsUrl()
  @IsOptional()
  ARBITRUM_SEPOLIA_RPC_URL?: string;

  @IsUrl()
  @IsOptional()
  OPTIMISM_MAINNET_RPC_URL?: string;

  @IsUrl()
  @IsOptional()
  OPTIMISM_SEPOLIA_RPC_URL?: string;

  @IsUrl()
  @IsOptional()
  POLYGON_MAINNET_RPC_URL?: string;

  @IsUrl()
  @IsOptional()
  POLYGON_AMOY_RPC_URL?: string;

  @IsUrl()
  @IsOptional()
  AVALANCHE_MAINNET_RPC_URL?: string;

  @IsUrl()
  @IsOptional()
  AVALANCHE_FUJI_RPC_URL?: string;

  @IsUrl()
  @IsOptional()
  GNOSIS_MAINNET_RPC_URL?: string;

  @IsUrl()
  @IsOptional()
  GNOSIS_CHIADO_RPC_URL?: string;

  @IsUrl()
  @IsOptional()
  LINEA_MAINNET_RPC_URL?: string;

  @IsUrl()
  @IsOptional()
  LINEA_SEPOLIA_RPC_URL?: string;

  @IsUrl()
  @IsOptional()
  FANTOM_MAINNET_RPC_URL?: string;

  @IsUrl()
  @IsOptional()
  FANTOM_TESTNET_RPC_URL?: string;

  @IsString()
  @IsOptional()
  BLOCKCHAIN_WITHDRAW_BNB_SYMBOL?: string;

  @IsString()
  @IsOptional()
  BLOCKCHAIN_WITHDRAW_POL_SYMBOL?: string;

  @IsString()
  @IsOptional()
  BLOCKCHAIN_WITHDRAW_AVAX_SYMBOL?: string;

  @IsString()
  @IsOptional()
  BLOCKCHAIN_WITHDRAW_XDAI_SYMBOL?: string;

  @IsString()
  @IsOptional()
  BLOCKCHAIN_WITHDRAW_FTM_SYMBOL?: string;

  @IsString()
  @IsOptional()
  BLOCKCHAIN_DEPOSIT_POL_TO_USDT_RATE?: string;

  @IsString()
  @IsOptional()
  BLOCKCHAIN_DEPOSIT_AVAX_TO_USDT_RATE?: string;

  @IsString()
  @IsOptional()
  BLOCKCHAIN_DEPOSIT_XDAI_TO_USDT_RATE?: string;

  @IsString()
  @IsOptional()
  BLOCKCHAIN_DEPOSIT_FTM_TO_USDT_RATE?: string;

  // PayOS Configuration
  @IsString()
  @IsOptional()
  PAYOS_CLIENT_ID?: string;

  @IsString()
  @IsOptional()
  PAYOS_API_KEY?: string;

  @IsString()
  @IsOptional()
  PAYOS_CHECKSUM_KEY?: string;

  @IsUrl()
  @IsOptional()
  PAYOS_RETURN_URL?: string;

  @IsUrl()
  @IsOptional()
  PAYOS_CANCEL_URL?: string;

  @IsString()
  @IsOptional()
  PAYOS_DEPOSIT_CURRENCY_SYMBOL?: string = 'USDT';

  @IsString()
  @IsOptional()
  PAYOS_FIAT_SYMBOL?: string = 'VND';

  @IsString()
  @IsOptional()
  PAYOS_FIAT_TO_QUOTE_RATE?: string = '1';

  @IsString()
  @IsOptional()
  PAYOS_FX_SPREAD_BPS?: string = '0';

  // Cloudinary (avatar upload)
  @IsString()
  @IsOptional()
  CLOUDINARY_CLOUD_NAME?: string;

  @IsString()
  @IsOptional()
  CLOUDINARY_API_KEY?: string;

  @IsString()
  @IsOptional()
  CLOUDINARY_API_SECRET?: string;

  @IsString()
  @IsOptional()
  CLOUDINARY_AVATAR_FOLDER?: string = 'avatars';

  // SMTP (2FA OTP email)
  @IsString()
  @IsOptional()
  SMTP_HOST?: string;

  @IsPort()
  @IsOptional()
  SMTP_PORT?: string = '587';

  @IsString()
  @IsOptional()
  SMTP_USER?: string;

  @IsString()
  @IsOptional()
  SMTP_PASS?: string;

  @IsString()
  @IsOptional()
  SMTP_FROM?: string;

  /** WalletConnect / Reown — phải có trong envVarKeys để ConfigService nhận từ .env */
  @IsString()
  @IsOptional()
  WALLETCONNECT_PROJECT_ID?: string;

  @IsString()
  @IsOptional()
  REOWN_PROJECT_ID?: string;

  @IsString()
  @IsOptional()
  WALLETCONNECT_RELAY_URL?: string;

  @IsString()
  @IsOptional()
  WALLETCONNECT_WEBHOOK_SECRET?: string;

  /** Encryption key for user Binance API credentials (AES-256-GCM) */
  @IsString()
  @IsOptional()
  BINANCE_CREDENTIALS_ENCRYPTION_KEY?: string;
}

/**
 * Validate environment variables
 * Throws error nếu validation fails
 * Chỉ validate các variables trong schema, ignore system variables
 */
export function validateEnvironment(config: Record<string, unknown>): EnvironmentVariables {
  // Filter chỉ lấy các properties có trong EnvironmentVariables class
  // Để tránh validate các system environment variables
  // Lưu ý: biến nào cần `ConfigService.get()` phải có trong envVarKeys + class ở trên
  // (Nest gán object đã validate vào process.env; thiếu key = .env có mà app không đọc được).
  const envVarKeys = [
    'NODE_ENV',
    'PORT',
    'APP_NAME',
    'DB_HOST',
    'DB_PORT',
    'DB_USERNAME',
    'DB_PASSWORD',
    'DB_NAME',
    'CORE_DB_SOURCE',
    'CORE_DB_TYPE',
    'CORE_DB_HOST',
    'CORE_DB_PORT',
    'CORE_DB_USERNAME',
    'CORE_DB_PASSWORD',
    'CORE_DB_NAME',
    'MARKET_READ_SOURCE',
    'MARKET_TS_ENABLED',
    'MARKET_TS_DRIVER',
    'MARKET_TS_TIMESCALE_ENABLED',
    'MARKET_TS_RETENTION_ENABLED',
    'MARKET_TS_RETENTION_DAYS',
    'MARKET_TS_COMPRESSION_ENABLED',
    'MARKET_TS_COMPRESS_AFTER_DAYS',
    'MARKET_TS_HOST',
    'MARKET_TS_PORT',
    'MARKET_TS_USERNAME',
    'MARKET_TS_PASSWORD',
    'MARKET_TS_DB',
    'ANALYTICS_ENABLED',
    'CLICKHOUSE_URL',
    'CLICKHOUSE_USER',
    'CLICKHOUSE_PASSWORD',
    'CLICKHOUSE_DB',
    'EVENT_OUTBOX_ENABLED',
    'EVENT_SCHEMA_FORMAT',
    'EVENT_PUBLISHER_DRIVER',
    'EVENT_OUTBOX_MAX_ATTEMPTS',
    'EVENT_OUTBOX_RETRY_BASE_MS',
    'EVENT_OUTBOX_ALERT_MAX_DEAD_LETTER_ROWS',
    'EVENT_OUTBOX_ALERT_MAX_OLDEST_UNPUBLISHED_AGE_SECONDS',
    'EVENT_OUTBOX_ALERT_MAX_OLDEST_DEAD_LETTER_AGE_SECONDS',
    'EVENT_OUTBOX_ALERT_CRITICAL_MAX_DEAD_LETTER_ROWS',
    'EVENT_OUTBOX_ALERT_CRITICAL_MAX_OLDEST_UNPUBLISHED_AGE_SECONDS',
    'EVENT_OUTBOX_ALERT_CRITICAL_MAX_OLDEST_DEAD_LETTER_AGE_SECONDS',
    'EVENT_OUTBOX_ALERT_AUTOMATION_ENABLED',
    'EVENT_OUTBOX_ALERTS_CHANNEL',
    'KAFKA_DLQ_TOPIC_ENABLED',
    'KAFKA_BROKERS',
    'KAFKA_CLIENT_ID',
    'KAFKA_TOPIC_PREFIX',
    'TICKER_SOURCE',
    'MATCHING_ENGINE',
    'MATCHING_GO_CANARY_PAIRS',
    'PUBLIC_WS_SOURCE',
    'GO_AGGREGATOR_TICKER_CHANNEL',
    'GO_AGGREGATOR_OHLC_CHANNEL',
    'MATCHING_SHADOW_MONITOR_PAIRS',
    'MATCHING_SHADOW_ALERT_MIN_MATCH_RATE_PERCENT',
    'MATCHING_SHADOW_ALERT_MAX_UNMATCHED_RUNS',
    'GO_ROLLOUT_WINDOW_HOURS',
    'GO_ROLLOUT_MAX_PUBLIC_WS_DRIFT_PAIRS',
    'GO_ROLLOUT_MIN_PUBLIC_WS_COMPARED_PAIRS',
    'GO_ROLLOUT_ROLLBACK_DRILL_MAX_AGE_HOURS',
    'MARKET_READ_MODEL_ALERT_MAX_LAG_SECONDS',
    'MARKET_READ_MODEL_ALERT_CRITICAL_MAX_LAG_SECONDS',
    'TYPEORM_DEBUG_SQL',
    'MM_DEFAULT_SPREAD_BPS',
    'MM_DEFAULT_SPREAD_ALERT_THRESHOLD_BPS',
    'MM_DEFAULT_ORDER_AMOUNT',
    'REDIS_HOST',
    'REDIS_PORT',
    'REDIS_PASSWORD',
    'REDIS_DB',
    'MATCHING_BOOK_FULL_REFRESH',
    'READ_MARKETS_FROM_PROJECTION',
    'READ_MODEL_ONCHAIN_DEPOSITS',
    'JWT_SECRET',
    'JWT_EXPIRATION',
    'JWT_REFRESH_SECRET',
    'JWT_REFRESH_EXPIRATION',
    'CORS_ORIGIN',
    'CORS_CREDENTIALS',
    'LOG_ENABLED',
    'LOG_LEVEL',
    'RATE_LIMIT_TTL',
    'RATE_LIMIT_MAX',
    'BCRYPT_ROUNDS',
    'API_KEY',
    'EXTERNAL_API_URL',
    'EXTERNAL_API_KEY',
    'TRADING_ENVIRONMENT',
    'EXCHANGE_MODE',
    'MOCK_EXCHANGE_BALANCE',
    'MOCK_EXCHANGE_ORDER_STATUS_PRICE',
    'SEED_USERS_JSON',
    'BINANCE_TESTNET_ENABLED',
    'BINANCE_TESTNET_API_KEY',
    'BINANCE_TESTNET_API_SECRET',
    'BINANCE_TESTNET_BASE_URL',
    'BINANCE_MAINNET_API_KEY',
    'BINANCE_MAINNET_API_SECRET',
    'BINANCE_MAINNET_BASE_URL',
    'WALLET_SYNC_INTERVAL',
    'WALLET_RECONCILIATION_THRESHOLD',
    'WALLET_ENCRYPTION_KEY',
    // ETH_HOT_WALLET_PRIVATE_KEY removed — managed via treasury_main_wallets
    // TRON_HOT_WALLET_PRIVATE_KEY removed — managed via treasury_main_wallets
    'BLOCKCHAIN_ALLOW_TEST_SIGNATURE',
    'ALLOW_UI_TEST_SIGNATURE',
    'BLOCKCHAIN_WITHDRAW_AUTO_MAX',
    'BLOCKCHAIN_WITHDRAW_AUTO_MAX_ETH_MAINNET',
    'BLOCKCHAIN_WITHDRAW_AUTO_MAX_BSC_MAINNET',
    'BLOCKCHAIN_WITHDRAW_AUTO_MAX_SOLANA_MAINNET',
    'BLOCKCHAIN_WITHDRAW_AUTO_MAX_TRON_MAINNET',
    'BLOCKCHAIN_WITHDRAW_ETH_SYMBOL',
    'BLOCKCHAIN_WITHDRAW_SOL_SYMBOL',
    'BLOCKCHAIN_WITHDRAW_TRON_SYMBOL',
    'TRON_MAINNET_FULL_HOST',
    'SOLANA_MAINNET_URL',
    'ETH_MAINNET_RPC_URL',
    'ETH_MAINNET_CHAIN_ID',
    'BSC_MAINNET_RPC_URL',
    'BSC_MAINNET_CHAIN_ID',
    'ONCHAIN_OPERATOR_MODE',
    'TRON_GRID_API_KEY',
    'TRON_NILE_FULL_HOST',
    'TRON_SHASTA_FULL_HOST',
    'SOLANA_DEVNET_URL',
    'BSC_CHAPEL_RPC_URL',
    'BSC_CHAPEL_CHAIN_ID',
    'ETH_SEPOLIA_RPC_URL',
    'BASE_MAINNET_RPC_URL',
    'BASE_SEPOLIA_RPC_URL',
    'ARBITRUM_MAINNET_RPC_URL',
    'ARBITRUM_SEPOLIA_RPC_URL',
    'OPTIMISM_MAINNET_RPC_URL',
    'OPTIMISM_SEPOLIA_RPC_URL',
    'POLYGON_MAINNET_RPC_URL',
    'POLYGON_AMOY_RPC_URL',
    'AVALANCHE_MAINNET_RPC_URL',
    'AVALANCHE_FUJI_RPC_URL',
    'GNOSIS_MAINNET_RPC_URL',
    'GNOSIS_CHIADO_RPC_URL',
    'LINEA_MAINNET_RPC_URL',
    'LINEA_SEPOLIA_RPC_URL',
    'FANTOM_MAINNET_RPC_URL',
    'FANTOM_TESTNET_RPC_URL',
    'BLOCKCHAIN_WITHDRAW_BNB_SYMBOL',
    'BLOCKCHAIN_WITHDRAW_POL_SYMBOL',
    'BLOCKCHAIN_WITHDRAW_AVAX_SYMBOL',
    'BLOCKCHAIN_WITHDRAW_XDAI_SYMBOL',
    'BLOCKCHAIN_WITHDRAW_FTM_SYMBOL',
    'BLOCKCHAIN_DEPOSIT_POL_TO_USDT_RATE',
    'BLOCKCHAIN_DEPOSIT_AVAX_TO_USDT_RATE',
    'BLOCKCHAIN_DEPOSIT_XDAI_TO_USDT_RATE',
    'BLOCKCHAIN_DEPOSIT_FTM_TO_USDT_RATE',
    'PAYOS_CLIENT_ID',
    'PAYOS_API_KEY',
    'PAYOS_CHECKSUM_KEY',
    'PAYOS_RETURN_URL',
    'PAYOS_CANCEL_URL',
    'PAYOS_DEPOSIT_CURRENCY_SYMBOL',
    'PAYOS_FIAT_SYMBOL',
    'PAYOS_FIAT_TO_QUOTE_RATE',
    'PAYOS_FX_SPREAD_BPS',
    'CLOUDINARY_CLOUD_NAME',
    'CLOUDINARY_API_KEY',
    'CLOUDINARY_API_SECRET',
    'CLOUDINARY_AVATAR_FOLDER',
    'SMTP_HOST',
    'SMTP_PORT',
    'SMTP_USER',
    'SMTP_PASS',
    'SMTP_FROM',

    'WALLETCONNECT_PROJECT_ID',
    'REOWN_PROJECT_ID',
    'WALLETCONNECT_RELAY_URL',
    'WALLETCONNECT_WEBHOOK_SECRET',
    'BINANCE_CREDENTIALS_ENCRYPTION_KEY',
  ];

  // Chỉ lấy các env vars mà chúng ta quan tâm
  const filteredConfig: Record<string, unknown> = {};
  for (const key of envVarKeys) {
    if (config[key] !== undefined) {
      filteredConfig[key] = config[key];
    }
  }

  const validatedConfig = plainToInstance(EnvironmentVariables, filteredConfig, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
    whitelist: true,
    forbidNonWhitelisted: false, // Allow unknown properties (system vars)
  });

  if (errors.length > 0) {
    const errorMessages = errors
      .map((error) => {
        const constraints = error.constraints
          ? Object.values(error.constraints).join(', ')
          : 'Unknown error';
        return `${error.property}: ${constraints}`;
      })
      .join('\n');

    throw new Error(`Environment validation failed:\n${errorMessages}`);
  }

  // PayOS: optional at startup — active credentials may live in payment_method_configs (UI).
  // DepositsService falls back to PAYOS_* from .env when no active DB config exists.

  applyCoreDbFallbacks(validatedConfig);
  assertCoreDbConfigOrThrow(validatedConfig);

  applyOnchainSandboxRpcDefaults(validatedConfig);
  assertOnchainSandboxRpcOrThrow(validatedConfig);

  return validatedConfig;
}

/** Map legacy DB_* env to CORE_DB_* when CORE_DB_* is omitted. */
export function applyCoreDbFallbacks(config: EnvironmentVariables): void {
  if (!config.CORE_DB_HOST && config.DB_HOST) config.CORE_DB_HOST = config.DB_HOST;
  if (!config.CORE_DB_PORT && config.DB_PORT) config.CORE_DB_PORT = config.DB_PORT;
  if (!config.CORE_DB_USERNAME && config.DB_USERNAME) config.CORE_DB_USERNAME = config.DB_USERNAME;
  if (!config.CORE_DB_PASSWORD && config.DB_PASSWORD) config.CORE_DB_PASSWORD = config.DB_PASSWORD;
  if (!config.CORE_DB_NAME && config.DB_NAME) config.CORE_DB_NAME = config.DB_NAME;
}

/** Require core DB connectivity settings after fallback mapping. */
export function assertCoreDbConfigOrThrow(config: EnvironmentVariables): void {
  const missing: string[] = [];
  if (!config.CORE_DB_HOST?.trim()) missing.push('CORE_DB_HOST');
  if (!config.CORE_DB_PORT?.trim()) missing.push('CORE_DB_PORT');
  if (!config.CORE_DB_USERNAME?.trim()) missing.push('CORE_DB_USERNAME');
  if (!config.CORE_DB_PASSWORD?.trim()) missing.push('CORE_DB_PASSWORD');
  if (!config.CORE_DB_NAME?.trim()) missing.push('CORE_DB_NAME');

  if (missing.length > 0) {
    throw new Error(`Environment validation failed: missing core DB vars: ${missing.join(', ')}`);
  }

  // Keep DB_* aligned for legacy call sites that still read DB_* directly.
  if (!config.DB_HOST) config.DB_HOST = config.CORE_DB_HOST;
  if (!config.DB_PORT) config.DB_PORT = config.CORE_DB_PORT;
  if (!config.DB_USERNAME) config.DB_USERNAME = config.CORE_DB_USERNAME;
  if (!config.DB_PASSWORD) config.DB_PASSWORD = config.CORE_DB_PASSWORD;
  if (!config.DB_NAME) config.DB_NAME = config.CORE_DB_NAME;
}

/** Public testnet RPC fallbacks — aligned with createAppConfig blockchain extras. */
const DEFAULT_SANDBOX_RPC_URLS: Partial<Record<keyof EnvironmentVariables, string>> = {
  TRON_NILE_FULL_HOST: 'https://nile.trongrid.io',
  SOLANA_DEVNET_URL: 'https://api.devnet.solana.com',
  BSC_CHAPEL_RPC_URL: 'https://data-seed-prebsc-1-s1.binance.org:8545',
};

/** When ONCHAIN_OPERATOR_MODE=sandbox, fill missing sandbox RPC vars so bootstrap matches app.config defaults. */
export function applyOnchainSandboxRpcDefaults(config: EnvironmentVariables): void {
  const mode = String(config.ONCHAIN_OPERATOR_MODE ?? 'production')
    .toLowerCase()
    .trim();
  if (mode !== 'sandbox') return;

  for (const key of Object.keys(DEFAULT_SANDBOX_RPC_URLS) as Array<keyof EnvironmentVariables>) {
    const def = DEFAULT_SANDBOX_RPC_URLS[key];
    if (def === undefined) continue;
    const cur = config[key];
    if (typeof cur !== 'string' || !cur.trim()) {
      (config as unknown as Record<string, string>)[key] = def;
    }
  }
}

/** When ONCHAIN_OPERATOR_MODE=sandbox, require sandbox RPC endpoints (after defaults). */
export function assertOnchainSandboxRpcOrThrow(config: EnvironmentVariables): void {
  const mode = String(config.ONCHAIN_OPERATOR_MODE ?? 'production')
    .toLowerCase()
    .trim();
  if (mode !== 'sandbox') return;

  const required: Array<{ key: keyof EnvironmentVariables; label: string }> = [
    { key: 'TRON_NILE_FULL_HOST', label: 'TRON_NILE_FULL_HOST' },
    { key: 'SOLANA_DEVNET_URL', label: 'SOLANA_DEVNET_URL' },
    { key: 'BSC_CHAPEL_RPC_URL', label: 'BSC_CHAPEL_RPC_URL' },
  ];

  for (const { key, label } of required) {
    const v = config[key];
    const ok = typeof v === 'string' && v.trim().length > 0;
    if (!ok) {
      throw new Error(
        `Environment validation failed: ONCHAIN_OPERATOR_MODE=sandbox requires ${label} (valid URL)`,
      );
    }
  }
}
