import { registerAs } from '@nestjs/config';
import { EnvironmentVariables } from './env.validation';
import { Environment } from '@/common/enums';

/**
 * Application Configuration Interface
 * Type-safe config với IntelliSense support
 */
export interface AppConfig {
  app: {
    name: string;
    env: Environment;
    port: number;
    url: string;
  };
  database: {
    host: string;
    port: number;
    username: string;
    password: string;
    database: string;
  };
  redis: {
    host: string;
    port: number;
    password?: string;
    db: number;
  };
  jwt: {
    secret: string;
    expiration: string;
    refreshSecret?: string;
    refreshExpiration: string;
  };
  cors: {
    origin: string | string[];
    credentials: boolean;
  };
  logging: {
    enabled: boolean;
    level: 'error' | 'warn' | 'info' | 'debug' | 'verbose';
  };
  rateLimit: {
    ttl: number;
    max: number;
  };
  security: {
    bcryptRounds: number;
    apiKey?: string;
  };
  external?: {
    apiUrl?: string;
    apiKey?: string;
  };
  trading: {
    environment: 'testnet' | 'mainnet';
    exchangeMode: 'binance' | 'mock';
    binance: {
      testnet: {
        enabled: boolean;
        apiKey: string;
        apiSecret: string;
        baseUrl: string;
      };
      mainnet: {
        enabled: boolean;
        apiKey: string;
        apiSecret: string;
        baseUrl: string;
      };
    };
  };
  wallet: {
    syncEnabled: boolean;
    syncInterval: number;
    reconciliationThreshold: string;
    enableExternalSync: boolean;
  };
  blockchain: {
    tron: {
      nileFullHost: string;
      shastaFullHost: string;
      mainnetFullHost: string;
      defaultNetwork: 'TRON_NILE' | 'TRON_SHASTA';
      // NOTE: hotWalletPrivateKey removed. Managed via treasury_main_wallets table.
    };
    solana: {
      devnetUrl: string;
    };
    ethereum: {
      sepoliaRpcUrl: string;
      chainId: number;
      mainnetRpcUrl: string;
      mainnetChainId: number;
      // NOTE: hotWalletPrivateKey removed. Managed via treasury_main_wallets table.
    };
  };
  /** Price oracle: on-demand OHLCV. App uses Binance only (no DB persist). UNISWAP_* env not used. */
  priceOracle?: {
    uniswap: {
      subgraphUrl: string;
      symbolToPoolId: Record<string, string>;
    };
  };
}

/**
 * App Configuration Builder
 * Builder Pattern: Step-by-step config building
 */
export class AppConfigBuilder {
  private config: Partial<AppConfig> = {};

  setApp(name: string, env: Environment, port: number, url: string): this {
    this.config.app = { name, env, port, url };
    return this;
  }

  setDatabase(
    host: string,
    port: number,
    username: string,
    password: string,
    database: string,
  ): this {
    this.config.database = { host, port, username, password, database };
    return this;
  }

  setRedis(host: string, port: number, password?: string, db: number = 0): this {
    this.config.redis = { host, port, password, db };
    return this;
  }

  setJwt(
    secret: string,
    expiration: string,
    refreshSecret?: string,
    refreshExpiration: string = '7d',
  ): this {
    this.config.jwt = { secret, expiration, refreshSecret, refreshExpiration };
    return this;
  }

  setCors(origin: string | string[], credentials: boolean = true): this {
    this.config.cors = { origin, credentials };
    return this;
  }

  setLogging(enabled: boolean, level: AppConfig['logging']['level'] = 'info'): this {
    this.config.logging = { enabled, level };
    return this;
  }

  setRateLimit(ttl: number, max: number): this {
    this.config.rateLimit = { ttl, max };
    return this;
  }

  setSecurity(bcryptRounds: number, apiKey?: string): this {
    this.config.security = { bcryptRounds, apiKey };
    return this;
  }

  setExternal(apiUrl?: string, apiKey?: string): this {
    this.config.external = { apiUrl, apiKey };
    return this;
  }

  setTrading(
    environment: 'testnet' | 'mainnet',
    exchangeMode: 'binance' | 'mock',
    binanceTestnetEnabled: boolean,
    binanceTestnetApiKey: string,
    binanceTestnetApiSecret: string,
    binanceTestnetBaseUrl: string,
    binanceMainnetApiKey: string,
    binanceMainnetApiSecret: string,
    binanceMainnetBaseUrl: string,
  ): this {
    this.config.trading = {
      environment,
      exchangeMode,
      binance: {
        testnet: {
          enabled: binanceTestnetEnabled,
          apiKey: binanceTestnetApiKey,
          apiSecret: binanceTestnetApiSecret,
          baseUrl: binanceTestnetBaseUrl,
        },
        mainnet: {
          enabled: false,
          apiKey: binanceMainnetApiKey,
          apiSecret: binanceMainnetApiSecret,
          baseUrl: binanceMainnetBaseUrl,
        },
      },
    };
    return this;
  }

  setWallet(
    syncEnabled: boolean,
    syncInterval: number,
    reconciliationThreshold: string,
    enableExternalSync: boolean,
  ): this {
    this.config.wallet = {
      syncEnabled,
      syncInterval,
      reconciliationThreshold,
      enableExternalSync,
    };
    return this;
  }

  setBlockchain(
    tronNileFullHost: string,
    tronShastaFullHost: string,
    tronMainnetFullHost: string,
    tronDefaultNetwork: string,
    solanaDevnetUrl: string,
    ethSepoliaRpcUrl: string,
    ethSepoliaChainId: number,
    ethMainnetRpcUrl: string,
    ethMainnetChainId: number,
  ): this {
    this.config.blockchain = {
      tron: {
        nileFullHost: tronNileFullHost,
        shastaFullHost: tronShastaFullHost,
        mainnetFullHost: tronMainnetFullHost,
        defaultNetwork: tronDefaultNetwork as 'TRON_NILE' | 'TRON_SHASTA',
        // hotWalletPrivateKey intentionally omitted — managed via treasury_main_wallets table
      },
      solana: {
        devnetUrl: solanaDevnetUrl,
      },
      ethereum: {
        sepoliaRpcUrl: ethSepoliaRpcUrl,
        chainId: ethSepoliaChainId,
        mainnetRpcUrl: ethMainnetRpcUrl,
        mainnetChainId: ethMainnetChainId,
        // hotWalletPrivateKey intentionally omitted — managed via treasury_main_wallets table
      },
    };
    return this;
  }

  setPriceOracle(
    uniswapSubgraphUrl: string,
    uniswapSymbolToPoolId: Record<string, string>,
  ): this {
    this.config.priceOracle = {
      uniswap: {
        subgraphUrl: uniswapSubgraphUrl,
        symbolToPoolId: uniswapSymbolToPoolId || {},
      },
    };
    return this;
  }

  build(): AppConfig {
    // Validate required fields
    if (!this.config.app) {
      throw new Error('App configuration is required');
    }
    if (!this.config.database) {
      throw new Error('Database configuration is required');
    }
    if (!this.config.redis) {
      throw new Error('Redis configuration is required');
    }
    if (!this.config.jwt) {
      throw new Error('JWT configuration is required');
    }

    return this.config as AppConfig;
  }
}

/**
 * Create App Configuration from Environment Variables
 * Factory Pattern: Create config from validated env vars
 */
export function createAppConfig(env: EnvironmentVariables): AppConfig {
  const builder = new AppConfigBuilder();

  // Parse CORS origin
  const corsOrigin =
    env.CORS_ORIGIN === '*' ? '*' : env.CORS_ORIGIN?.split(',').map((o) => o.trim()) || '*';

  // Build app URL
  const appUrl =
    env.NODE_ENV === Environment.Production
      ? `https://api.example.com`
      : `http://localhost:${env.PORT || 3000}`;

  return builder
    .setApp(env.APP_NAME || 'Cryptocurrency Trading API', env.NODE_ENV || Environment.Development, env.PORT || 3000, appUrl)
    .setDatabase(
      env.DB_HOST,
      parseInt(env.DB_PORT, 10),
      env.DB_USERNAME,
      env.DB_PASSWORD,
      env.DB_NAME,
    )
    .setRedis(env.REDIS_HOST || 'localhost', env.REDIS_PORT || 6379, env.REDIS_PASSWORD, env.REDIS_DB || 0)
    .setJwt(
      env.JWT_SECRET,
      env.JWT_EXPIRATION || '24h',
      env.JWT_REFRESH_SECRET,
      env.JWT_REFRESH_EXPIRATION || '7d',
    )
    .setCors(corsOrigin, env.CORS_CREDENTIALS !== false)
    .setLogging(env.LOG_ENABLED !== false, env.LOG_LEVEL || 'info')
    .setRateLimit(env.RATE_LIMIT_TTL || 60, env.RATE_LIMIT_MAX || 100)
    .setSecurity(env.BCRYPT_ROUNDS || 10, env.API_KEY)
    .setExternal(env.EXTERNAL_API_URL, env.EXTERNAL_API_KEY)
    .setTrading(
      (env.TRADING_ENVIRONMENT as 'testnet' | 'mainnet') || 'testnet',
      (env.EXCHANGE_MODE as 'binance' | 'mock') || 'mock',
      env.BINANCE_TESTNET_ENABLED || false,
      env.BINANCE_TESTNET_API_KEY || '',
      env.BINANCE_TESTNET_API_SECRET || '',
      env.BINANCE_TESTNET_BASE_URL || 'https://testnet.binancefutures.com',
      env.BINANCE_MAINNET_API_KEY || '',
      env.BINANCE_MAINNET_API_SECRET || '',
      env.BINANCE_MAINNET_BASE_URL || 'https://fapi.binance.com',
    )
    .setWallet(
      env.BINANCE_TESTNET_ENABLED || false,
      env.WALLET_SYNC_INTERVAL || 30000,
      env.WALLET_RECONCILIATION_THRESHOLD || '0.00000001',
      env.EXCHANGE_MODE === 'binance',
    )
    .setBlockchain(
      (env as any).TRON_NILE_FULL_HOST || 'https://nile.trongrid.io',
      (env as any).TRON_SHASTA_FULL_HOST || 'https://api.shasta.trongrid.io',
      (env as any).TRON_MAINNET_FULL_HOST || 'https://api.trongrid.io',
      (env as any).TRON_DEFAULT_NETWORK || 'TRON_NILE',
      (env as any).SOLANA_DEVNET_URL || 'https://api.devnet.solana.com',
      (env as any).ETH_SEPOLIA_RPC_URL || 'https://rpc.sepolia.org',
      parseInt((env as any).ETH_SEPOLIA_CHAIN_ID, 10) || 11155111,
      (env as any).ETH_MAINNET_RPC_URL || 'https://eth.llamarpc.com',
      parseInt((env as any).ETH_MAINNET_CHAIN_ID, 10) || 1,
      // hotWalletPrivateKey params removed — managed via treasury_main_wallets table
    )
    .setPriceOracle(
      (env as any).UNISWAP_SUBGRAPH_URL ||
        'https://gateway.thegraph.com/api/subgraphs/id/DiYPVdygkfjDWhbxGSqAQxwBKmfKnkWQojqeM2rkLb3G',
      parseUniswapSymbolToPoolId((env as any).UNISWAP_SYMBOL_POOL_MAP),
    )
    .build();
}

function parseUniswapSymbolToPoolId(json?: string): Record<string, string> {
  if (!json || typeof json !== 'string') return {};
  try {
    const o = JSON.parse(json);
    return o && typeof o === 'object' ? o : {};
  } catch {
    return {};
  }
}

/**
 * App Configuration Namespace
 * Register as NestJS config namespace
 */
export default registerAs('app', (): AppConfig => {
  // This will be called by NestJS ConfigModule
  // Environment variables are already validated at bootstrap
  const env = process.env as unknown as EnvironmentVariables;
  return createAppConfig(env);
});
