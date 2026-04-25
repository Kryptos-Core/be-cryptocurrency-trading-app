import 'reflect-metadata';
import { Environment } from '@/common/enums';
import { createAppConfig } from './app.config';
import { validateEnvironment } from './env.validation';

function minimalValidEnv(): Record<string, unknown> {
  return {
    NODE_ENV: Environment.Development,
    DB_HOST: 'localhost',
    DB_PORT: '5432',
    DB_USERNAME: 'user',
    DB_PASSWORD: 'pass',
    DB_NAME: 'crypto',
    CORE_DB_SOURCE: 'postgres',
    CORE_DB_TYPE: 'postgres',
    CORE_DB_HOST: 'localhost',
    CORE_DB_PORT: '5432',
    CORE_DB_USERNAME: 'user',
    CORE_DB_PASSWORD: 'pass',
    CORE_DB_NAME: 'crypto',
    JWT_SECRET: 'test-jwt-secret-at-least-32-chars-long',
  };
}

describe('createAppConfig', () => {
  it('does not expose DEX subgraph or pool-map settings (Binance-only price oracle)', () => {
    const env = validateEnvironment(minimalValidEnv());
    const config = createAppConfig(env);
    expect(config).not.toHaveProperty('priceOracle');
  });

  it('maps multi-database and feature-flag env into config namespace', () => {
    const env = validateEnvironment({
      ...minimalValidEnv(),
      MARKET_TS_ENABLED: 'true',
      MARKET_TS_HOST: '127.0.0.2',
      MARKET_TS_PORT: '5433',
      MARKET_TS_USERNAME: 'ts_user',
      MARKET_TS_PASSWORD: 'ts_pass',
      MARKET_TS_DB: 'market_ts',
      ANALYTICS_ENABLED: 'true',
      CLICKHOUSE_URL: 'http://127.0.0.1:8123',
      CLICKHOUSE_USER: 'default',
      CLICKHOUSE_PASSWORD: '',
      CLICKHOUSE_DB: 'analytics',
      MATCHING_GO_CANARY_PAIRS: 'BTC_USDT, ETH_USDT',
      EVENT_OUTBOX_ENABLED: 'false',
      PUBLIC_WS_SOURCE: 'go',
      GO_AGGREGATOR_TICKER_CHANNEL: 'trading:go:ticker',
      GO_AGGREGATOR_OHLC_CHANNEL: 'trading:go:ohlc',
      MATCHING_SHADOW_MONITOR_PAIRS: 'pair-1,pair-2',
      MATCHING_SHADOW_ALERT_MIN_MATCH_RATE_PERCENT: '97.5',
      MATCHING_SHADOW_ALERT_MAX_UNMATCHED_RUNS: '2',
      MATCHING_ENGINE: 'go_shadow',
      TICKER_SOURCE: 'go_aggregator',
      MARKET_READ_SOURCE: 'timescale',
    });

    const config = createAppConfig(env);

    expect(config.database.type).toBe('postgres');
    expect(config.marketTs.enabled).toBe(true);
    expect(config.marketTs.host).toBe('127.0.0.2');
    expect(config.featureFlags.marketReadSource).toBe('timescale');
    expect(config.featureFlags.tickerSource).toBe('go_aggregator');
    expect(config.featureFlags.matchingEngine).toBe('go_shadow');
    expect(config.featureFlags.publicWsSource).toBe('go');
    expect(config.featureFlags.goAggregatorTickerChannel).toBe('trading:go:ticker');
    expect(config.featureFlags.goAggregatorOhlcChannel).toBe('trading:go:ohlc');
    expect(config.featureFlags.matchingShadowMonitorPairs).toEqual(['pair-1', 'pair-2']);
    expect(config.featureFlags.matchingShadowAlertMinMatchRatePercent).toBe(97.5);
    expect(config.featureFlags.matchingShadowAlertMaxUnmatchedRuns).toBe(2);
    expect(config.featureFlags.eventOutboxEnabled).toBe(false);
    expect(config.featureFlags.matchingGoCanaryPairs).toEqual(['BTC_USDT', 'ETH_USDT']);
  });
});
