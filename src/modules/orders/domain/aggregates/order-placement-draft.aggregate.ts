import { AggregateRoot } from '@/common/ddd/aggregate-root.base';

export type OrderPlacementSide = 'BUY' | 'SELL';

/**
 * Pilot aggregate for order placement invariants (DDD write model).
 * Persistence mapping stays in infrastructure; this type is pure domain.
 */
export class OrderPlacementDraftAggregate extends AggregateRoot {
  private constructor(
    public readonly orderId: string,
    public readonly pairId: string,
    public readonly side: OrderPlacementSide,
    private _amount: string,
  ) {
    super();
  }

  static create(input: {
    orderId: string;
    pairId: string;
    side: OrderPlacementSide;
    amount: string;
  }): OrderPlacementDraftAggregate {
    const n = Number(input.amount);
    if (!Number.isFinite(n) || n <= 0) {
      throw new Error('ORDER_AMOUNT_MUST_BE_POSITIVE');
    }
    if (!input.pairId?.trim()) {
      throw new Error('ORDER_PAIR_REQUIRED');
    }
    return new OrderPlacementDraftAggregate(
      input.orderId,
      input.pairId.trim(),
      input.side,
      input.amount,
    );
  }

  get amount(): string {
    return this._amount;
  }

  adjustAmount(next: string): void {
    const n = Number(next);
    if (!Number.isFinite(n) || n <= 0) {
      throw new Error('ORDER_AMOUNT_MUST_BE_POSITIVE');
    }
    this._amount = next;
  }
}
