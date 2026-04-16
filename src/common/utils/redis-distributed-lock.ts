import type { Logger } from '@nestjs/common';
import type { RedisService } from '@/common/services/redis.service';

/**
 * Lua script that deletes a key only when its value matches the provided token.
 * Ensures only the lock owner can release it (atomic compare-and-delete).
 */
const RELEASE_LOCK_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`;

export interface DistributedLockOptions {
  /** Redis key for the lock. */
  lockKey: string;
  /** Seconds before the lock auto-expires (safety net for crashed workers). */
  ttlSeconds: number;
  /** Caller name for log messages. */
  callerName?: string;
}

/**
 * Runs `fn` under a Redis distributed lock (SET NX EX).
 *
 * - Acquires lock with a unique token (PID + timestamp + random suffix).
 * - Skips `fn` silently if another instance already holds the lock.
 * - Releases the lock in a `finally` block using the atomic Lua script.
 *
 * @returns `true` if `fn` ran, `false` if the lock was already held.
 */
export async function withDistributedLock(
  redisService: RedisService,
  options: DistributedLockOptions,
  fn: () => Promise<void>,
  logger?: Pick<Logger, 'log' | 'warn' | 'error'>,
): Promise<boolean> {
  const { lockKey, ttlSeconds, callerName = 'DistributedLock' } = options;
  const lockToken = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const acquired = await redisService.setIfNotExists(lockKey, lockToken, ttlSeconds);
  if (!acquired) {
    logger?.log(`[${callerName}] Skipped — lock "${lockKey}" is held by another instance`);
    return false;
  }

  try {
    await fn();
    return true;
  } finally {
    try {
      await redisService.getClient().eval(RELEASE_LOCK_SCRIPT, 1, lockKey, lockToken);
    } catch (err) {
      logger?.error(
        `[${callerName}] Failed to release lock "${lockKey}": ${(err as Error).message}`,
      );
    }
  }
}
