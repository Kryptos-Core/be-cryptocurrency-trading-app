import 'reflect-metadata';
import { Environment } from '@/common/enums';
import { createAppConfig } from './app.config';
import { validateEnvironment } from './env.validation';

function minimalValidEnv(): Record<string, unknown> {
  return {
    NODE_ENV: Environment.Development,
    DB_HOST: 'localhost',
    DB_PORT: '3306',
    DB_USERNAME: 'user',
    DB_PASSWORD: 'pass',
    DB_NAME: 'crypto',
    JWT_SECRET: 'test-jwt-secret-at-least-32-chars-long',
  };
}

describe('createAppConfig', () => {
  it('does not expose DEX subgraph or pool-map settings (Binance-only price oracle)', () => {
    const env = validateEnvironment(minimalValidEnv());
    const config = createAppConfig(env);
    expect(config).not.toHaveProperty('priceOracle');
  });
});
