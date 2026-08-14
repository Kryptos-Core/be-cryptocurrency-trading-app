import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CacheInvalidationHelper, CacheService, RedisService } from '@/common/services';

/**
 * Redis Module
 * Global module for Redis operations
 * Singleton Pattern: Single Redis connection instance
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [RedisService, CacheService, CacheInvalidationHelper],
  exports: [RedisService, CacheService, CacheInvalidationHelper],
})
export class RedisModule {}
