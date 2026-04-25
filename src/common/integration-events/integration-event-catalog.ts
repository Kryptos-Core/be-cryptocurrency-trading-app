/** Values persisted on `integration_outbox.event_type` today */
export const OutboxIntegrationEventType = {
  MarketPairCreatedV1: 'MarketPair.Created@v1',
  MarketPairUpdatedV1: 'MarketPair.Updated@v1',
  OnchainDepositSubmittedV1: 'OnchainDeposit.Submitted@v1',
  OnchainDepositSettledV1: 'OnchainDeposit.Settled@v1',
  UnmatchedDepositDetectedV1: 'UnmatchedDeposit.Detected@v1',
  DepositMatchedV1: 'UnmatchedDeposit.Matched@v1',
  OrderCreatedV1: 'order.created',
  OrderCancelRequestedV1: 'order.cancel_requested',
  OrderCancelledV1: 'order.cancelled',
  OrderRejectedV1: 'order.rejected',
  TradeExecutedV1: 'trade.executed',
  WalletBalanceChangedV1: 'wallet.balance_changed',
  MarketTickerUpdatedV1: 'market.ticker_updated',
} as const;

export type OutboxIntegrationEventTypeName =
  (typeof OutboxIntegrationEventType)[keyof typeof OutboxIntegrationEventType];

export const IntegrationEventType = {
  ...OutboxIntegrationEventType,
  /** Logical name for read-model sync (same rows as Created/Updated) */
  MarketPairReadModelSync: 'MarketPairReadModelSync',
  /** Reserve for cross-context wallet / ledger notifications */
  WalletLedgerChanged: 'WalletLedgerChanged',
  /** Reserve for order lifecycle notifications to analytics / notifications */
  OrderLifecycle: 'OrderLifecycle',
  /** Reserve for on-chain deposit / withdrawal confirmations */
  OnchainMovement: 'OnchainMovement',
} as const;

export type IntegrationEventTypeName =
  (typeof IntegrationEventType)[keyof typeof IntegrationEventType];

const ALL: ReadonlySet<string> = new Set(Object.values(IntegrationEventType));

export function isKnownIntegrationEventType(type: string): type is IntegrationEventTypeName {
  return ALL.has(type);
}
