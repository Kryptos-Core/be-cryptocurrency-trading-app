import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RedisService, CacheService } from '@/common/services';

/**
 * Redis Module
 * Global module for Redis operations
 * Singleton Pattern: Single Redis connection instance
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [RedisService, CacheService],
  exports: [RedisService, CacheService],
})
export class RedisModule {}
