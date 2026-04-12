import { ConfigService } from '@nestjs/config';
import type { RedisOptions } from 'ioredis';

/**
 * Redis Configuration
 * Singleton Pattern: Single Redis connection instance
 */
export const getRedisConfig = (configService: ConfigService): RedisOptions => {
  return {
    host: configService.get<string>('REDIS_HOST', 'localhost'),
    port: configService.get<number>('REDIS_PORT', 6379),
    password: configService.get<string>('REDIS_PASSWORD'),
    db: configService.get<number>('REDIS_DB', 0),
    retryStrategy: (times: number) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    enableOfflineQueue: false,
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
