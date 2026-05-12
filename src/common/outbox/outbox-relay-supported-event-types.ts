import { OutboxIntegrationEventType } from '@/common/integration-events/integration-event-catalog';

/**
 * Outbox rows with these `event_type` values are eligible for relay selection.
 * Unmapped types must not block the queue (see relay query + skip_locked).
 */
export const OUTBOX_RELAY_SUPPORTED_EVENT_TYPES: readonly string[] = [
  OutboxIntegrationEventType.MarketPairCreatedV1,
  OutboxIntegrationEventType.MarketPairUpdatedV1,
  OutboxIntegrationEventType.OnchainDepositSubmittedV1,
  OutboxIntegrationEventType.OnchainDepositSettledV1,
  OutboxIntegrationEventType.UnmatchedDepositDetectedV1,
  OutboxIntegrationEventType.DepositMatchedV1,
  OutboxIntegrationEventType.OrderCreatedV1,
  OutboxIntegrationEventType.OrderCancelRequestedV1,
  OutboxIntegrationEventType.OrderCancelledV1,
  OutboxIntegrationEventType.OrderRejectedV1,
  OutboxIntegrationEventType.TradeExecutedV1,
  OutboxIntegrationEventType.WalletBalanceChangedV1,
  OutboxIntegrationEventType.MarketTickerUpdatedV1,
];
