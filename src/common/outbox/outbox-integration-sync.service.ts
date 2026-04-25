import { Injectable, Logger } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { OutboxIntegrationEventType } from '@/common/integration-events/integration-event-catalog';
import type { MarketPairReadModelSyncPayload } from '@/common/integration-events/market-pair-read-model-sync.integration-event';
import {
  isCanonicalIntegrationEventEnvelope,
  unwrapCanonicalIntegrationEventPayload,
} from '@/common/integration-events/canonical-integration-event-envelope';
import { MarketPairReadModelSyncApplierService } from '@/common/read-model/market-pair-read-model-sync-applier.service';
import { MarketTickerReadModelSyncApplierService } from '@/common/read-model/market-ticker-read-model-sync-applier.service';
import { OnchainDepositReadModelSyncApplierService } from '@/common/read-model/onchain-deposit-read-model-sync-applier.service';
import { TradeReadModelSyncApplierService } from '@/common/read-model/trade-read-model-sync-applier.service';
import { IntegrationOutbox } from '@/entities/integration-outbox.entity';
import { OnchainDepositOutboxNotificationService } from '@/modules/notifications/onchain-deposit-outbox-notification.service';
import { ProcessedIntegrationEventsService } from './processed-integration-events.service';

const CONSUMERS = {
  marketPairReadModel: 'market-pair-read-model-sync',
  onchainDepositReadModel: 'onchain-deposit-read-model-sync',
  onchainDepositNotification: 'onchain-deposit-notification-sync',
  tradeReadModel: 'trade-read-model-sync',
  marketTickerReadModel: 'market-ticker-read-model-sync',
} as const;

@Injectable()
export class OutboxIntegrationSyncService {
  private readonly logger = new Logger(OutboxIntegrationSyncService.name);

  constructor(
    private readonly marketPairApplier: MarketPairReadModelSyncApplierService,
    private readonly onchainDepositReadApplier: OnchainDepositReadModelSyncApplierService,
    private readonly tradeReadModelApplier: TradeReadModelSyncApplierService,
    private readonly marketTickerReadModelApplier: MarketTickerReadModelSyncApplierService,
    private readonly onchainDepositNotifications: OnchainDepositOutboxNotificationService,
    private readonly processedEvents: ProcessedIntegrationEventsService,
  ) {}

  async dispatchRow(em: EntityManager, row: IntegrationOutbox): Promise<void> {
    switch (row.event_type) {
      case OutboxIntegrationEventType.MarketPairCreatedV1:
      case OutboxIntegrationEventType.MarketPairUpdatedV1: {
        const payload = this.getPayload<MarketPairReadModelSyncPayload>(row);
        await this.processedEvents.runOnce(
          em,
          CONSUMERS.marketPairReadModel,
          row.id,
          row.event_type,
          async () => {
            await this.marketPairApplier.apply(em, payload);
          },
        );
        return;
      }
      case OutboxIntegrationEventType.OnchainDepositSubmittedV1:
      case OutboxIntegrationEventType.OnchainDepositSettledV1:
      case OutboxIntegrationEventType.DepositMatchedV1: {
        await this.processedEvents.runOnce(
          em,
          CONSUMERS.onchainDepositReadModel,
          row.id,
          row.event_type,
          async () => {
            await this.onchainDepositReadApplier.applyFromOutboxRow(em, row);
          },
        );
        await this.processedEvents.runOnce(
          em,
          CONSUMERS.onchainDepositNotification,
          row.id,
          row.event_type,
          async () => {
            await this.onchainDepositNotifications.applyFromOutboxRow(em, row);
          },
        );
        return;
      }
      case OutboxIntegrationEventType.TradeExecutedV1: {
        await this.processedEvents.runOnce(
          em,
          CONSUMERS.tradeReadModel,
          row.id,
          row.event_type,
          async () => {
            await this.tradeReadModelApplier.applyFromOutboxRow(em, row);
          },
        );
        return;
      }
      case OutboxIntegrationEventType.MarketTickerUpdatedV1: {
        await this.processedEvents.runOnce(
          em,
          CONSUMERS.marketTickerReadModel,
          row.id,
          row.event_type,
          async () => {
            await this.marketTickerReadModelApplier.applyFromOutboxRow(em, row);
          },
        );
        return;
      }
      case OutboxIntegrationEventType.OrderCreatedV1:
      case OutboxIntegrationEventType.OrderCancelRequestedV1:
      case OutboxIntegrationEventType.OrderCancelledV1:
      case OutboxIntegrationEventType.OrderRejectedV1:
      case OutboxIntegrationEventType.WalletBalanceChangedV1:
        return;
      default:
        this.logger.error(`dispatchRow: unsupported event_type=${row.event_type} id=${row.id}`);
        throw new Error(`UNSUPPORTED_OUTBOX_EVENT_TYPE:${row.event_type}`);
    }
  }

  private getPayload<TPayload extends object>(row: IntegrationOutbox): TPayload {
    const payload = unwrapCanonicalIntegrationEventPayload<TPayload>(row.payload) ??
      (row.payload as TPayload);

    if (isCanonicalIntegrationEventEnvelope(row.payload)) {
      if (row.payload.eventType !== row.event_type) {
        this.logger.warn(
          `Outbox envelope eventType mismatch id=${row.id} row=${row.event_type} payload=${row.payload.eventType}`,
        );
      }
      if (row.payload.aggregateType !== row.aggregate_type) {
        this.logger.warn(
          `Outbox envelope aggregateType mismatch id=${row.id} row=${row.aggregate_type} payload=${row.payload.aggregateType}`,
        );
      }
      if (row.payload.aggregateId !== row.aggregate_id) {
        this.logger.warn(
          `Outbox envelope aggregateId mismatch id=${row.id} row=${row.aggregate_id} payload=${row.payload.aggregateId}`,
        );
      }
    }

    return payload;
  }
}
