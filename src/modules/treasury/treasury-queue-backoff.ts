import { BusinessException } from '@/common/exceptions';

type TreasuryDeferOpts = { delay?: number };

/**
 * Bull custom backoff: deferred retries for per-wallet lock contention use exponential delay (capped);
 * other failures use standard exponential backoff vs delay base from opts.delay.
 */
export function treasuryDeferBackoff(
  attemptsMade: number,
  err: Error,
  strategyOptions?: TreasuryDeferOpts,
): number {
  const errAny = err as unknown as { code?: string };
  const code =
    err instanceof BusinessException
      ? err.code
      : typeof errAny.code === 'string'
        ? errAny.code
        : undefined;

  if (code === 'TREASURY_WALLET_BUSY') {
    const step = Math.max(attemptsMade - 1, 0);
    return Math.min(20_000, 3000 * 2 ** Math.min(step, 5));
  }

  /** Terminal — no Bull retry (DB already marked FAILED in processor). */
  if (code === 'TREASURY_WALLET_BUSY_TIMEOUT') {
    return -1;
  }

  const base =
    typeof strategyOptions?.delay === 'number' && strategyOptions.delay > 0
      ? strategyOptions.delay
      : 3000;
  return Math.round((2 ** attemptsMade - 1) * base);
}
