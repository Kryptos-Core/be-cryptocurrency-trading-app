import { createHash } from 'crypto';

/**
 * Maximum length of the `aggregate_id` column in `integration_outbox`.
 * Defined as varchar(64) in the database schema.
 */
const MAX_AGGREGATE_ID_LENGTH = 64;

/**
 * Stable, collision-resistant wallet aggregate ID derived from userId + currencyId.
 *
 * Problem: `${userId}:${currencyId}` produces 73 chars when both are UUID v7 (36 + 1 + 36),
 * but `aggregate_id` is limited to varchar(64) in integration_outbox.
 *
 * Solution: derive a fixed 32-char hex digest via MD5 (128-bit) of the natural key.
 * This is deterministic and safe for the aggregate_id purpose (not a security primitive).
 */
export function walletAggregateId(userId: string, currencyId: string): string {
  const digest = createHash('md5').update(`${userId}:${currencyId}`).digest('hex');
  return digest; // exactly 32 chars, guaranteed < 64
}

/**
 * Validates that a string fits within the aggregate_id column limit.
 * Throws with a descriptive error if it exceeds the limit.
 */
export function assertMaxAggregateIdLength(value: string, label?: string): void {
  if (value.length > MAX_AGGREGATE_ID_LENGTH) {
    const msg = label
      ? `aggregate_id for "${label}" exceeds ${MAX_AGGREGATE_ID_LENGTH} chars (got ${value.length}): "${value.slice(0, 80)}${value.length > 80 ? '...' : ''}"`
      : `aggregate_id exceeds ${MAX_AGGREGATE_ID_LENGTH} chars (got ${value.length}): "${value.slice(0, 80)}${value.length > 80 ? '...' : ''}"`;
    throw new Error(msg);
  }
}
