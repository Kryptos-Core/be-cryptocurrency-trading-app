import type { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { ReadMarketTicker } from '@/entities/read-market-ticker.entity';
import { ReadMarketTrade } from '@/entities/read-market-trade.entity';

export const CORE_DB = 'CORE_DB';
export const MARKET_TS_DB = 'MARKET_TS_DB';
export const ANALYTICS_DB = 'ANALYTICS_DB';

function asBool(value: string | undefined, defaultValue: boolean): boolean {
  if (value == null) return defaultValue;
  const normalized = value.trim().toLowerCase();
  return ['true', '1', 'yes', 'on'].includes(normalized);
}

function resolveCoreDb(config: ConfigService): {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
} {
  return {
    host: config.get<string>('CORE_DB_HOST') ?? config.get<string>('DB_HOST') ?? '127.0.0.1',
    port: config.get<number>('CORE_DB_PORT') ?? config.get<number>('DB_PORT') ?? 5432,
    username: config.get<string>('CORE_DB_USERNAME') ?? config.get<string>('DB_USERNAME') ?? '',
    password: config.get<string>('CORE_DB_PASSWORD') ?? config.get<string>('DB_PASSWORD') ?? '',
    database: config.get<string>('CORE_DB_NAME') ?? config.get<string>('DB_NAME') ?? '',
  };
}

function resolveMarketTsDb(config: ConfigService): {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
} {
  const core = resolveCoreDb(config);
  return {
    host: config.get<string>('MARKET_TS_HOST') ?? core.host,
    port: config.get<number>('MARKET_TS_PORT') ?? core.port,
    username: config.get<string>('MARKET_TS_USERNAME') ?? core.username,
    password: config.get<string>('MARKET_TS_PASSWORD') ?? core.password,
    database: config.get<string>('MARKET_TS_DB') ?? core.database,
  };
}

const coreDbProvider: Provider = {
  provide: CORE_DB,
  inject: [ConfigService],
  useFactory: async (config: ConfigService) => {
    const core = resolveCoreDb(config);
    const ds = new DataSource({
      type: 'postgres',
      host: core.host,
      port: core.port,
      username: core.username,
      password: core.password,
      database: core.database,
      synchronize: false,
      logging: false,
    });

    await ds.initialize();
    return ds;
  },
};

const marketTsDbProvider: Provider = {
  provide: MARKET_TS_DB,
  inject: [ConfigService],
  useFactory: async (config: ConfigService) => {
    const enabled = asBool(config.get<string>('MARKET_TS_ENABLED'), false);
    if (!enabled) return null;

    const market = resolveMarketTsDb(config);
    const ds = new DataSource({
      type: 'postgres',
      host: market.host,
      port: market.port,
      username: market.username,
      password: market.password,
      database: market.database,
      synchronize: false,
      logging: false,
      entities: [ReadMarketTrade, ReadMarketTicker],
    });

    await ds.initialize();
    return ds;
  },
};

const analyticsDbProvider: Provider = {
  provide: ANALYTICS_DB,
  inject: [ConfigService],
  useFactory: (config: ConfigService) => {
    const enabled = asBool(config.get<string>('ANALYTICS_ENABLED'), false);
    if (!enabled) return null;

    return {
      url: config.get<string>('CLICKHOUSE_URL') ?? 'http://127.0.0.1:8123',
      user: config.get<string>('CLICKHOUSE_USER') ?? 'default',
      password: config.get<string>('CLICKHOUSE_PASSWORD') ?? '',
      database: config.get<string>('CLICKHOUSE_DB') ?? 'default',
    };
  },
};

export const databaseProviders: Provider[] = [coreDbProvider, marketTsDbProvider, analyticsDbProvider];
