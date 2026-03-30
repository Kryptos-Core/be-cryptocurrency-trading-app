import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Min,
  Max,
  validateSync,
  IsBoolean,
  IsPort,
  IsIn,
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
  @IsNotEmpty()
  DB_HOST!: string;

  @IsPort()
  @IsNotEmpty()
  DB_PORT!: string;

  @IsString()
  @IsNotEmpty()
  DB_USERNAME!: string;

  @IsString()
  @IsNotEmpty()
  DB_PASSWORD!: string;

  @IsString()
  @IsNotEmpty()
  DB_NAME!: string;

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
  @IsString()
  @IsOptional()
  ETH_HOT_WALLET_PRIVATE_KEY?: string;

  @IsString()
  @IsOptional()
  TRON_HOT_WALLET_PRIVATE_KEY?: string;

  @IsBoolean()
  @IsOptional()
  BLOCKCHAIN_ALLOW_TEST_SIGNATURE?: boolean = false;

  @IsString()
  @IsOptional()
  BLOCKCHAIN_WITHDRAW_AUTO_MAX?: string = '0';

  @IsString()
  @IsOptional()
  BLOCKCHAIN_WITHDRAW_AUTO_MAX_ETH_SEPOLIA?: string;

  @IsString()
  @IsOptional()
  BLOCKCHAIN_WITHDRAW_AUTO_MAX_SOLANA_DEVNET?: string;

  @IsString()
  @IsOptional()
  BLOCKCHAIN_WITHDRAW_AUTO_MAX_TRON_NILE?: string;

  @IsString()
  @IsOptional()
  BLOCKCHAIN_WITHDRAW_AUTO_MAX_TRON_SHASTA?: string;

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
  ETH_MAINNET_RPC_URL?: string;

  @IsInt()
  @IsOptional()
  ETH_MAINNET_CHAIN_ID?: number;

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

  /** Fiat (bank) withdrawal — min amount in platform cash currency (e.g. USDT). */
  @IsString()
  @IsOptional()
  FIAT_WITHDRAW_MIN?: string = '10';

  /** Fiat withdrawal — max single request amount. */
  @IsString()
  @IsOptional()
  FIAT_WITHDRAW_MAX?: string = '100000';

  /**
   * Max total pending+completed fiat withdrawal amount per user per UTC day.
   * 0 = disabled (no daily cap).
   */
  @IsString()
  @IsOptional()
  FIAT_WITHDRAW_DAILY_LIMIT_USER?: string = '0';

  /** Timeout cho gọi Cas.so / BankHub (grant, exchange, identity), milliseconds. */
  @IsInt()
  @Min(1000)
  @Max(30000)
  @IsOptional()
  CAS_BANKHUB_TIMEOUT_MS?: number = 8000;

  /** BankHub base: sandbox `https://sandbox.bankhub.dev`, production từ Console. */
  @IsUrl()
  @IsOptional()
  CAS_BANKHUB_BASE_URL?: string;

  @IsString()
  @IsOptional()
  CAS_CLIENT_ID?: string;

  @IsString()
  @IsOptional()
  CAS_SECRET_KEY?: string;

  /** Redirect sau Cas Link (khớp cấu hình Console). */
  @IsUrl()
  @IsOptional()
  CAS_BALANCE_HOOK_REDIRECT_URI?: string;

  /** Ví dụ docs: `qrpay` — chỉnh theo product Balance Hook trong Console. */
  @IsString()
  @IsOptional()
  CAS_BALANCE_HOOK_SCOPES?: string;

  @IsString()
  @IsOptional()
  CAS_BANKHUB_API_VERSION?: string = '2023-01-01';

  /**
   * Danh sách IP được phép gọi POST webhook Cas (comma-separated).
   * Sandbox doc: 20.2.69.168. Để trống = không chặn theo IP (chỉ dùng khi dev / sau reverse proxy).
   */
  @IsString()
  @IsOptional()
  CAS_WEBHOOK_TRUSTED_IPS?: string;

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
    'REDIS_HOST',
    'REDIS_PORT',
    'REDIS_PASSWORD',
    'REDIS_DB',
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
    'ETH_HOT_WALLET_PRIVATE_KEY',
    'TRON_HOT_WALLET_PRIVATE_KEY',
    'BLOCKCHAIN_ALLOW_TEST_SIGNATURE',
    'BLOCKCHAIN_WITHDRAW_AUTO_MAX',
    'BLOCKCHAIN_WITHDRAW_AUTO_MAX_ETH_SEPOLIA',
    'BLOCKCHAIN_WITHDRAW_AUTO_MAX_SOLANA_DEVNET',
    'BLOCKCHAIN_WITHDRAW_AUTO_MAX_TRON_NILE',
    'BLOCKCHAIN_WITHDRAW_AUTO_MAX_TRON_SHASTA',
    'BLOCKCHAIN_WITHDRAW_ETH_SYMBOL',
    'BLOCKCHAIN_WITHDRAW_SOL_SYMBOL',
    'BLOCKCHAIN_WITHDRAW_TRON_SYMBOL',
    'TRON_MAINNET_FULL_HOST',
    'ETH_MAINNET_RPC_URL',
    'ETH_MAINNET_CHAIN_ID',
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
    'FIAT_WITHDRAW_MIN',
    'FIAT_WITHDRAW_MAX',
    'FIAT_WITHDRAW_DAILY_LIMIT_USER',
    'CAS_BANKHUB_TIMEOUT_MS',
    'CAS_BANKHUB_BASE_URL',
    'CAS_CLIENT_ID',
    'CAS_SECRET_KEY',
    'CAS_BALANCE_HOOK_REDIRECT_URI',
    'CAS_BALANCE_HOOK_SCOPES',
    'CAS_BANKHUB_API_VERSION',
    'CAS_WEBHOOK_TRUSTED_IPS',
    'WALLETCONNECT_PROJECT_ID',
    'REOWN_PROJECT_ID',
    'WALLETCONNECT_RELAY_URL',
    'WALLETCONNECT_WEBHOOK_SECRET',
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

  if (validatedConfig.NODE_ENV === Environment.Production) {
    const requiredPayosKeys: Array<keyof EnvironmentVariables> = [
      'PAYOS_CLIENT_ID',
      'PAYOS_API_KEY',
      'PAYOS_CHECKSUM_KEY',
      'PAYOS_RETURN_URL',
      'PAYOS_CANCEL_URL',
    ];

    const missingPayosKeys = requiredPayosKeys.filter((key) => {
      const value = validatedConfig[key];
      return typeof value !== 'string' || value.trim().length === 0;
    });

    if (missingPayosKeys.length > 0) {
      throw new Error(
        `Environment validation failed:\nMissing required PayOS env vars in production: ${missingPayosKeys.join(', ')}`,
      );
    }
  }

  return validatedConfig;
}
