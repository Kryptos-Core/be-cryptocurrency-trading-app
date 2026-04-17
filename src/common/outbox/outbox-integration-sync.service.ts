import { Injectable, Logger } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { OutboxIntegrationEventType } from '@/common/integration-events/integration-event-catalog';
import type { MarketPairReadModelSyncPayload } from '@/common/integration-events/market-pair-read-model-sync.integration-event';
import { MarketPairReadModelSyncApplierService } from '@/common/read-model/market-pair-read-model-sync-applier.service';
import { OnchainDepositReadModelSyncApplierService } from '@/common/read-model/onchain-deposit-read-model-sync-applier.service';
import { IntegrationOutbox } from '@/entities/integration-outbox.entity';
import { OnchainDepositOutboxNotificationService } from '@/modules/notifications/onchain-deposit-outbox-notification.service';

@Injectable()
export class OutboxIntegrationSyncService {
  private readonly logger = new Logger(OutboxIntegrationSyncService.name);

  constructor(
    private readonly marketPairApplier: MarketPairReadModelSyncApplierService,
    private readonly onchainDepositReadApplier: OnchainDepositReadModelSyncApplierService,
    private readonly onchainDepositNotifications: OnchainDepositOutboxNotificationService,
  ) {}

  /**
   * Runs all synchronous side-effects for one outbox row inside the caller's transaction.
   * Throws on failure so the relay does not mark published_at.
   */
  async dispatchRow(em: EntityManager, row: IntegrationOutbox): Promise<void> {
    switch (row.event_type) {
      case OutboxIntegrationEventType.MarketPairCreatedV1:
      case OutboxIntegrationEventType.MarketPairUpdatedV1: {
        const payload = row.payload as unknown as MarketPairReadModelSyncPayload;
        await this.marketPairApplier.apply(em, payload);
        return;
      }
      case OutboxIntegrationEventType.OnchainDepositSubmittedV1:
      case OutboxIntegrationEventType.OnchainDepositSettledV1: {
        await this.onchainDepositReadApplier.applyFromOutboxRow(em, row);
        await this.onchainDepositNotifications.applyFromOutboxRow(em, row);
        return;
      }
      default:
        this.logger.error(`dispatchRow: unsupported event_type=${row.event_type} id=${row.id}`);
        throw new Error(`UNSUPPORTED_OUTBOX_EVENT_TYPE:${row.event_type}`);
    }
  }
}
