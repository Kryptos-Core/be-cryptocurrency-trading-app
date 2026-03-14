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

  // Hot Wallet Configuration
  @IsString()
  @IsOptional()
  ETH_HOT_WALLET_PRIVATE_KEY?: string;

  @IsString()
  @IsOptional()
  TRON_HOT_WALLET_PRIVATE_KEY?: string;
}

/**
 * Validate environment variables
 * Throws error nếu validation fails
 * Chỉ validate các variables trong schema, ignore system variables
 */
export function validateEnvironment(config: Record<string, unknown>): EnvironmentVariables {
  // Filter chỉ lấy các properties có trong EnvironmentVariables class
  // Để tránh validate các system environment variables
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
    'ETH_HOT_WALLET_PRIVATE_KEY',
    'TRON_HOT_WALLET_PRIVATE_KEY',
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

  return validatedConfig;
}
