import { registerAs } from '@nestjs/config';
import { Environment } from '@/common/enums';
import type { EnvironmentVariables } from './env.validation';

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
    source: string;
    type: string;
    host: string;
    port: number;
    username: string;
    password: string;
    database: string;
  };
  marketTs: {
    enabled: boolean;
    driver: string;
    timescaleEnabled: boolean;
    retentionEnabled: boolean;
    retentionDays: number;
    compressionEnabled: boolean;
    compressAfterDays: number;
    host: string;
    port: number;
    username: string;
    password: string;
    database: string;
  };
  analytics: {
    enabled: boolean;
    clickhouseUrl: string;
    clickhouseUser: string;
    clickhousePassword: string;
    clickhouseDatabase: string;
  };
  featureFlags: {
    marketReadSource: string;
    tickerSource: string;
    matchingEngine: string;
    matchingGoCanaryPairs: string[];
    publicWsSource: string;
    goAggregatorTickerChannel: string;
    goAggregatorOhlcChannel: string;
    matchingShadowMonitorPairs: string[];
    matchingShadowAlertMinMatchRatePercent: number;
    matchingShadowAlertMaxUnmatchedRuns: number;
    goRolloutWindowHours: number;
    goRolloutMaxPublicWsDriftPairs: number;
    eventOutboxEnabled: boolean;
    eventSchemaFormat: string;
    eventPublisherDriver: string;
    eventOutboxAlertMaxDeadLetterRows: number;
    eventOutboxAlertMaxOldestUnpublishedAgeSeconds: number;
    eventOutboxAlertMaxOldestDeadLetterAgeSeconds: number;
    eventOutboxAlertCriticalMaxDeadLetterRows: number;
    eventOutboxAlertCriticalMaxOldestUnpublishedAgeSeconds: number;
    eventOutboxAlertCriticalMaxOldestDeadLetterAgeSeconds: number;
    eventOutboxAlertAutomationEnabled: boolean;
    eventOutboxAlertsChannel: string;
    kafkaBrokers: string[];
    kafkaClientId: string;
    kafkaTopicPrefix: string;
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
    /** Used when exchangeMode is mock (Decimal-parseable strings). */
    mockExchange: {
      balance: string;
      orderStatusPrice: string;
    };
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
    onchainOperatorMode: 'production' | 'sandbox';
    tron: {
      mainnetFullHost: string;
      nileFullHost: string;
      shastaFullHost: string;
    };
    solana: {
      mainnetUrl: string;
      devnetUrl: string;
    };
    ethereum: {
      mainnetRpcUrl: string;
      mainnetChainId: number;
    };
    bsc: {
      mainnetRpcUrl: string;
      mainnetChainId: number;
      chapelRpcUrl: string;
      chapelChainId: number;
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
    source: string,
    type: string,
    host: string,
    port: number,
    username: string,
    password: string,
    database: string,
  ): this {
    this.config.database = { source, type, host, port, username, password, database };
    return this;
  }

  setMarketTs(
    enabled: boolean,
    driver: string,
    timescaleEnabled: boolean,
    retentionEnabled: boolean,
    retentionDays: number,
    compressionEnabled: boolean,
    compressAfterDays: number,
    host: string,
    port: number,
    username: string,
    password: string,
    database: string,
  ): this {
    this.config.marketTs = {
      enabled,
      driver,
      timescaleEnabled,
      retentionEnabled,
      retentionDays,
      compressionEnabled,
      compressAfterDays,
      host,
      port,
      username,
      password,
      database,
    };
    return this;
  }

  setAnalytics(
    enabled: boolean,
    clickhouseUrl: string,
    clickhouseUser: string,
    clickhousePassword: string,
    clickhouseDatabase: string,
  ): this {
    this.config.analytics = {
      enabled,
      clickhouseUrl,
      clickhouseUser,
      clickhousePassword,
      clickhouseDatabase,
    };
    return this;
  }

  setFeatureFlags(flags: AppConfig['featureFlags']): this {
    this.config.featureFlags = flags;
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
    mockExchangeBalance: string = '10000',
    mockExchangeOrderStatusPrice: string = '50000',
  ): this {
    this.config.trading = {
      environment,
      exchangeMode,
      mockExchange: {
        balance: mockExchangeBalance,
        orderStatusPrice: mockExchangeOrderStatusPrice,
      },
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
    tronMainnetFullHost: string,
    solanaMainnetUrl: string,
    ethMainnetRpcUrl: string,
    ethMainnetChainId: number,
    bscMainnetRpcUrl: string,
    bscMainnetChainId: number,
    extras?: {
      onchainOperatorMode: 'production' | 'sandbox';
      tronNileFullHost: string;
      tronShastaFullHost: string;
      solanaDevnetUrl: string;
      bscChapelRpcUrl: string;
      bscChapelChainId: number;
    },
  ): this {
    const mode = extras?.onchainOperatorMode ?? 'production';
    this.config.blockchain = {
      onchainOperatorMode: mode,
      tron: {
        mainnetFullHost: tronMainnetFullHost,
        nileFullHost: extras?.tronNileFullHost ?? 'https://nile.trongrid.io',
        shastaFullHost: extras?.tronShastaFullHost ?? 'https://api.shasta.trongrid.io',
      },
      solana: {
        mainnetUrl: solanaMainnetUrl,
        devnetUrl: extras?.solanaDevnetUrl ?? 'https://api.devnet.solana.com',
      },
      ethereum: {
        mainnetRpcUrl: ethMainnetRpcUrl,
        mainnetChainId: ethMainnetChainId,
      },
      bsc: {
        mainnetRpcUrl: bscMainnetRpcUrl,
        mainnetChainId: bscMainnetChainId,
        chapelRpcUrl: extras?.bscChapelRpcUrl ?? 'https://data-seed-prebsc-1-s1.binance.org:8545',
        chapelChainId: extras?.bscChapelChainId ?? 97,
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
    if (!this.config.marketTs) {
      throw new Error('Market TS configuration is required');
    }
    if (!this.config.analytics) {
      throw new Error('Analytics configuration is required');
    }
    if (!this.config.featureFlags) {
      throw new Error('Feature flags configuration is required');
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
    .setApp(
      env.APP_NAME || 'Cryptocurrency Trading API',
      env.NODE_ENV || Environment.Development,
      env.PORT || 3000,
      appUrl,
    )
    .setDatabase(
      env.CORE_DB_SOURCE || 'postgres',
      env.CORE_DB_TYPE || 'postgres',
      env.CORE_DB_HOST || env.DB_HOST || '127.0.0.1',
      parseInt(env.CORE_DB_PORT || env.DB_PORT || '5432', 10),
      env.CORE_DB_USERNAME || env.DB_USERNAME || '',
      env.CORE_DB_PASSWORD || env.DB_PASSWORD || '',
      env.CORE_DB_NAME || env.DB_NAME || '',
    )
.setMarketTs(
      String(env.MARKET_TS_ENABLED || 'false').toLowerCase() === 'true',
      env.MARKET_TS_DRIVER || 'postgres',
      String(env.MARKET_TS_TIMESCALE_ENABLED || 'false').toLowerCase() === 'true',
      String(env.MARKET_TS_RETENTION_ENABLED || 'false').toLowerCase() === 'true',
      parseInt(env.MARKET_TS_RETENTION_DAYS || '30', 10),
      String(env.MARKET_TS_COMPRESSION_ENABLED || 'false').toLowerCase() === 'true',
      parseInt(env.MARKET_TS_COMPRESS_AFTER_DAYS || '7', 10),
      env.MARKET_TS_HOST || env.CORE_DB_HOST || env.DB_HOST || '127.0.0.1',
      parseInt(env.MARKET_TS_PORT || env.CORE_DB_PORT || env.DB_PORT || '5432', 10),
      env.MARKET_TS_USERNAME || env.CORE_DB_USERNAME || env.DB_USERNAME || '',
      env.MARKET_TS_PASSWORD || env.CORE_DB_PASSWORD || env.DB_PASSWORD || '',
      env.MARKET_TS_DB || env.CORE_DB_NAME || env.DB_NAME || '',
    )
    .setAnalytics(
      String(env.ANALYTICS_ENABLED || 'false').toLowerCase() === 'true',
      env.CLICKHOUSE_URL || 'http://127.0.0.1:8123',
      env.CLICKHOUSE_USER || 'default',
      env.CLICKHOUSE_PASSWORD || '',
      env.CLICKHOUSE_DB || 'default',
    )
    .setFeatureFlags({
      marketReadSource: env.MARKET_READ_SOURCE || 'postgres',
      tickerSource: env.TICKER_SOURCE || 'nestjs',
      matchingEngine: env.MATCHING_ENGINE || 'ts',
      matchingGoCanaryPairs: (env.MATCHING_GO_CANARY_PAIRS || '')
        .split(',')
        .map((pair) => pair.trim())
        .filter(Boolean),
      publicWsSource: env.PUBLIC_WS_SOURCE || 'nestjs',
      goAggregatorTickerChannel:
        env.GO_AGGREGATOR_TICKER_CHANNEL || 'trading:external:ticker',
      goAggregatorOhlcChannel: env.GO_AGGREGATOR_OHLC_CHANNEL || 'trading:external:ohlc',
      matchingShadowMonitorPairs: (env.MATCHING_SHADOW_MONITOR_PAIRS || '')
        .split(',')
        .map((pair) => pair.trim())
        .filter(Boolean),
      matchingShadowAlertMinMatchRatePercent: Number(
        env.MATCHING_SHADOW_ALERT_MIN_MATCH_RATE_PERCENT || '99.9',
      ),
      matchingShadowAlertMaxUnmatchedRuns: Number(
        env.MATCHING_SHADOW_ALERT_MAX_UNMATCHED_RUNS || '0',
      ),
      goRolloutWindowHours: Number(env.GO_ROLLOUT_WINDOW_HOURS || '24'),
      goRolloutMaxPublicWsDriftPairs: Number(
        env.GO_ROLLOUT_MAX_PUBLIC_WS_DRIFT_PAIRS || '0',
      ),
      eventOutboxEnabled: String(env.EVENT_OUTBOX_ENABLED || 'true').toLowerCase() !== 'false',
      eventSchemaFormat: env.EVENT_SCHEMA_FORMAT || 'json',
      eventPublisherDriver: env.EVENT_PUBLISHER_DRIVER || 'noop',
      eventOutboxAlertMaxDeadLetterRows: Number(
        env.EVENT_OUTBOX_ALERT_MAX_DEAD_LETTER_ROWS || '0',
      ),
      eventOutboxAlertMaxOldestUnpublishedAgeSeconds: Number(
        env.EVENT_OUTBOX_ALERT_MAX_OLDEST_UNPUBLISHED_AGE_SECONDS || '300',
      ),
      eventOutboxAlertMaxOldestDeadLetterAgeSeconds: Number(
        env.EVENT_OUTBOX_ALERT_MAX_OLDEST_DEAD_LETTER_AGE_SECONDS || '60',
      ),
      eventOutboxAlertCriticalMaxDeadLetterRows: Number(
        env.EVENT_OUTBOX_ALERT_CRITICAL_MAX_DEAD_LETTER_ROWS || '10',
      ),
      eventOutboxAlertCriticalMaxOldestUnpublishedAgeSeconds: Number(
        env.EVENT_OUTBOX_ALERT_CRITICAL_MAX_OLDEST_UNPUBLISHED_AGE_SECONDS || '1800',
      ),
      eventOutboxAlertCriticalMaxOldestDeadLetterAgeSeconds: Number(
        env.EVENT_OUTBOX_ALERT_CRITICAL_MAX_OLDEST_DEAD_LETTER_AGE_SECONDS || '600',
      ),
      eventOutboxAlertAutomationEnabled:
        String(env.EVENT_OUTBOX_ALERT_AUTOMATION_ENABLED || 'true').toLowerCase() !== 'false',
      eventOutboxAlertsChannel: env.EVENT_OUTBOX_ALERTS_CHANNEL || 'outbox:alerts',
      kafkaBrokers: (env.KAFKA_BROKERS || '')
        .split(',')
        .map((broker) => broker.trim())
        .filter(Boolean),
      kafkaClientId: env.KAFKA_CLIENT_ID || 'crypto-trading-backend-outbox',
      kafkaTopicPrefix: env.KAFKA_TOPIC_PREFIX || '',
    })
    .setRedis(
      env.REDIS_HOST || 'localhost',
      env.REDIS_PORT || 6379,
      env.REDIS_PASSWORD,
      env.REDIS_DB || 0,
    )
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
      env.MOCK_EXCHANGE_BALANCE ?? '10000',
      env.MOCK_EXCHANGE_ORDER_STATUS_PRICE ?? '50000',
    )
    .setWallet(
      env.BINANCE_TESTNET_ENABLED || false,
      env.WALLET_SYNC_INTERVAL || 30000,
      env.WALLET_RECONCILIATION_THRESHOLD || '0.00000001',
      env.EXCHANGE_MODE === 'binance',
    )
    .setBlockchain(
      env.TRON_MAINNET_FULL_HOST || 'https://api.trongrid.io',
      env.SOLANA_MAINNET_URL || 'https://api.mainnet-beta.solana.com',
      env.ETH_MAINNET_RPC_URL || 'https://eth.llamarpc.com',
      env.ETH_MAINNET_CHAIN_ID ?? 1,
      env.BSC_MAINNET_RPC_URL || 'https://bsc-dataseed.binance.org',
      env.BSC_MAINNET_CHAIN_ID ?? 56,
      {
        onchainOperatorMode:
          String(env.ONCHAIN_OPERATOR_MODE || 'production')
            .toLowerCase()
            .trim() === 'sandbox'
            ? 'sandbox'
            : 'production',
        tronNileFullHost: env.TRON_NILE_FULL_HOST || 'https://nile.trongrid.io',
        tronShastaFullHost: env.TRON_SHASTA_FULL_HOST || 'https://api.shasta.trongrid.io',
        solanaDevnetUrl: env.SOLANA_DEVNET_URL || 'https://api.devnet.solana.com',
        bscChapelRpcUrl: env.BSC_CHAPEL_RPC_URL || 'https://data-seed-prebsc-1-s1.binance.org:8545',
        bscChapelChainId: env.BSC_CHAPEL_CHAIN_ID ?? 97,
      },
    )
    .build();
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




