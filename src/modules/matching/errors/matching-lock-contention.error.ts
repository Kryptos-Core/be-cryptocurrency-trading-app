/**
 * Thrown when Redis pair lock cannot be acquired after retries.
 * Bull consumer should rethrow so the job is retried.
 */
export class MatchingLockContentionError extends Error {
  readonly pairId: string;
  readonly orderId: string;

  constructor(pairId: string, orderId: string) {
    super(`Matching lock contention for pair=${pairId} order=${orderId}`);
    this.name = 'MatchingLockContentionError';
    this.pairId = pairId;
    this.orderId = orderId;
  }
}
