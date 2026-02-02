import { registerAs } from '@nestjs/config';
import { EnvironmentVariables } from './env.validation';
import { Environment } from './config.types';

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
