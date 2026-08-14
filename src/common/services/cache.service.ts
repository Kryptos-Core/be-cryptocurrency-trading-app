import { Injectable } from '@nestjs/common';
import { RedisService } from './redis.service';
import { trace } from '@opentelemetry/api';

/**
 * Cache Service
 * Wrapper around RedisService for caching operations
 * Cache-Aside Pattern implementation
 */
@Injectable()
export class CacheService {
  private readonly DEFAULT_TTL = 3600; // 1 hour

  constructor(private readonly redisService: RedisService) {}

  /**
   * Cache hit/miss counters exposed via OpenTelemetry. Attribute `module` is
   * derived from the cache key prefix (first colon-separated segment) so
   * dashboards can group by `cache.hits{module="wallets"}` etc.
   */
  private recordHit(key: string, value: unknown): void {
    this.recordMetric('hit', key);
    if (value !== null) {
      const span = trace.getActiveSpan();
      span?.setAttribute('cache.hit', true);
    }
  }

  private recordMiss(key: string): void {
    this.recordMetric('miss', key);
    const span = trace.getActiveSpan();
    span?.setAttribute('cache.miss', true);
  }

  private recordMetric(verdict: 'hit' | 'miss', key: string): void {
    const moduleName = key.split(':')[0] || 'unknown';
    const span = trace.getActiveSpan();
    if (span) {
      span.setAttribute(`cache.${verdict}.module`, moduleName);
    }
  }

  /**
   * Get value from cache
   */
  async get<T>(key: string): Promise<T | null> {
    const value = await this.redisService.get(key);
    if (!value) {
      return null;
    }
    try {
      return JSON.parse(value) as T;
    } catch {
      return value as T;
    }
  }

  /**
   * Set value to cache with optional TTL
   */
  async set<T>(key: string, value: T, ttl: number = this.DEFAULT_TTL): Promise<void> {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    await this.redisService.set(key, serialized, ttl);
  }

  /**
   * Idempotent claim: chỉ set nếu key chưa có (Redis SET NX EX).
   */
  async setIfNotExists<T>(key: string, value: T, ttlSec: number): Promise<boolean> {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    return this.redisService.setIfNotExists(key, serialized, ttlSec);
  }

  /**
   * Delete key from cache
   */
  async delete(key: string): Promise<void> {
    await this.redisService.del(key);
  }

  /**
   * Delete multiple keys
   */
  async deleteMany(...keys: string[]): Promise<void> {
    if (keys.length > 0) {
      await this.redisService.del(...keys);
    }
  }

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    const result = await this.redisService.exists(key);
    return result === 1;
  }

  /**
   * Get or set pattern (Cache-Aside)
   */
  async getOrSet<T>(key: string, factory: () => Promise<T>, ttl?: number): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) {
      this.recordHit(key, cached);
      return cached;
    }

    this.recordMiss(key);
    const value = await factory();
    await this.set(key, value, ttl);
    return value;
  }

  /**
   * Invalidate cache by pattern
   */
  async invalidatePattern(pattern: string): Promise<void> {
    const keys = await this.redisService.keys(pattern);
    if (keys.length > 0) {
      await this.redisService.del(...keys);
    }
  }

  /**
   * Set expiration for key
   */
  async expire(key: string, seconds: number): Promise<void> {
    await this.redisService.expire(key, seconds);
  }

  /**
   * Get TTL for key
   */
  async getTtl(key: string): Promise<number> {
    return this.redisService.ttl(key);
  }
}
