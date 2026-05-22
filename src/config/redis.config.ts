import { ConfigService } from '@nestjs/config';
import type { RedisOptions } from 'ioredis';

/**
 * Redis Configuration
 * Singleton Pattern: Single Redis connection instance
 */
export const getRedisConfig = (configService: ConfigService): RedisOptions => {
  const rawPassword = configService.get<string>('REDIS_PASSWORD');
  const password = rawPassword && rawPassword.trim().length > 0 ? rawPassword : undefined;

  return {
    host: configService.get<string>('REDIS_HOST', 'localhost'),
    port: configService.get<number>('REDIS_PORT', 6379),
    password,
    db: configService.get<number>('REDIS_DB', 0),
    retryStrategy: (times: number) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    enableOfflineQueue: true,
    connectTimeout: 10000,
    lazyConnect: false, // Auto-connect on instantiation
  };
};

/**
 * Bull Queue Redis Configuration
 */
export const getBullRedisConfig = (configService: ConfigService) => {
  const redisConfig = getRedisConfig(configService);
  return {
    host: redisConfig.host,
    port: redisConfig.port,
    password: redisConfig.password,
    db: redisConfig.db,
  };
};
