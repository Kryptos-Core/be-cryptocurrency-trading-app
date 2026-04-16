import { DomainEvent } from './base.event';

/**
 * Domain event fired when an order is successfully placed.
 */
export class OrderPlacedEvent extends DomainEvent {
  public readonly eventType = 'OrderPlaced' as const;

  constructor(
    public readonly orderId: string,
    public readonly userId: string,
    public readonly pairId: string,
    public readonly side: 'BUY' | 'SELL',
    public readonly price: string,
    public readonly amount: string,
  ) {
    super();
  }
}

/**
 * Domain event fired when an order is cancelled.
 */
export class OrderCancelledEvent extends DomainEvent {
  public readonly eventType = 'OrderCancelled' as const;

  constructor(
    public readonly orderId: string,
    public readonly userId: string,
    public readonly reason: string,
  ) {
    super();
  }
}

/**
 * Domain event fired when a trade is executed.
 */
export class TradeExecutedEvent extends DomainEvent {
  public readonly eventType = 'TradeExecuted' as const;

  constructor(
    public readonly tradeId: string,
    public readonly pairId: string,
    public readonly makerOrderId: string,
    public readonly takerOrderId: string,
    public readonly price: string,
    public readonly amount: string,
    public readonly makerUserId: string,
    public readonly takerUserId: string,
  ) {
    super();
  }
}

/**
 * Domain event fired when a deposit is confirmed.
 */
export class DepositConfirmedEvent extends DomainEvent {
  public readonly eventType = 'DepositConfirmed' as const;

  constructor(
    public readonly depositId: string,
    public readonly userId: string,
    public readonly currencyId: string,
    public readonly amount: string,
  ) {
    super();
  }
}

/**
 * Domain event fired when a wallet balance changes.
 */
export class WalletBalanceChangedEvent extends DomainEvent {
  public readonly eventType = 'WalletBalanceChanged' as const;

  constructor(
    public readonly userId: string,
    public readonly currencyId: string,
    public readonly availableBefore: string,
    public readonly availableAfter: string,
    public readonly frozenBefore: string,
    public readonly frozenAfter: string,
  ) {
    super();
  }
}
