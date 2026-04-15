import Decimal from 'decimal.js';

/**
 * Domain Service: Balance Calculation
 * Pure business logic for wallet balance computations.
 * No framework imports — testable in isolation.
 */
export class BalanceCalculationService {
  /**
   * Calculate total balance from available and frozen.
   */
  calculateTotal(available: string, frozen: string): string {
    return new Decimal(available || '0').plus(new Decimal(frozen || '0')).toString();
  }

  /**
   * Parse and validate a positive decimal amount.
   * Throws plain Error (domain layer — no HTTP exceptions).
   */
  parsePositiveAmount(amount: string): Decimal {
    let value: Decimal;
    try {
      value = new Decimal(amount);
    } catch {
      throw new BalanceValidationError('Invalid amount format', 'INVALID_AMOUNT');
    }
    if (value.lte(0)) {
      throw new BalanceValidationError('Amount must be greater than 0', 'INVALID_AMOUNT');
    }
    return value;
  }

  /**
   * Build a normalised balance snapshot.
   */
  buildBalanceSnapshot(
    userId: string,
    currencyId: string,
    available: string,
    frozen: string,
  ): { userId: string; currencyId: string; available: string; frozen: string; total: string } {
    const safeAvailable = (available ?? '0').toString();
    const safeFrozen = (frozen ?? '0').toString();
    return {
      userId,
      currencyId,
      available: safeAvailable,
      frozen: safeFrozen,
      total: this.calculateTotal(safeAvailable, safeFrozen),
    };
  }

  /**
   * Compute the discrepancy between internal and external balances.
   */
  computeDiscrepancy(
    internalBalance: string,
    externalBalance: string,
  ): { discrepancy: Decimal; status: 'BALANCED' | 'DISCREPANCY_DETECTED' } {
    const internal = new Decimal(internalBalance);
    const external = new Decimal(externalBalance);
    const discrepancy = external.minus(internal);
    return {
      discrepancy,
      status: discrepancy.isZero() ? 'BALANCED' : 'DISCREPANCY_DETECTED',
    };
  }
}

/**
 * Domain error for balance validation failures.
 */
export class BalanceValidationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'BalanceValidationError';
  }
}
