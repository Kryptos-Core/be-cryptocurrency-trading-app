import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from './redis.service';

/**
 * CacheInvalidationHelper
 * Sends per-user cache invalidation signals without ever using blocking `KEYS`.
 * Uses Redis SCAN with COUNT to iterate keyspace safely under load.
 *
 * Convention: every user-scoped cache key MUST start with `<moduleNamespace>:<entity>:user:<userId>:`
 * so that pattern `<moduleNamespace>:<entity>:user:<userId>:*` matches all variants (status, page, etc.) of that user.
 */
@Injectable()
export class CacheInvalidationHelper {
  private readonly logger = new Logger(CacheInvalidationHelper.name);
  private static readonly SCAN_COUNT = 200;

  constructor(private readonly redisService: RedisService) {}

  /**
   * Invalidate every cache key for a given user across the listed modules.
   *
   * @param moduleNamespaces list of cache module namespaces (e.g. `wallets`, `orders`, `users`)
   * @param userId user whose caches should be wiped
   */
  async invalidateUserCaches(moduleNamespaces: string[], userId: string): Promise<void> {
    if (!userId || moduleNamespaces.length === 0) return;

    for (const ns of moduleNamespaces) {
      const pattern = `${ns}:user:${userId}:*`;
      try {
        await this.scanAndDel(pattern);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Failed to invalidate ${pattern}: ${message}`);
      }
    }
  }

  /**
   * Invalidate every cache key for a given user within a single namespace.
   * Convenience wrapper for callers that only know one module.
   */
  async invalidateUserNamespace(namespace: string, userId: string): Promise<void> {
    return this.invalidateUserCaches([namespace], userId);
  }

  /**
   * Iterate keys matching `pattern` via SCAN and delete them in batches.
   * Avoids KEYS — safe for production with millions of keys.
   */
  private async scanAndDel(pattern: string): Promise<number> {
    let cursor = '0';
    let deleted = 0;

    do {
      const [next, batch] = await this.redisService.scan(cursor, pattern, CacheInvalidationHelper.SCAN_COUNT);
      cursor = next;
      if (batch.length > 0) {
        deleted += await this.redisService.del(...batch);
      }
    } while (cursor !== '0');

    if (deleted > 0) {
      this.logger.debug(`Invalidated ${deleted} key(s) for pattern ${pattern}`);
    }
    return deleted;
  }
}
