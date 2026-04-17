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
];
