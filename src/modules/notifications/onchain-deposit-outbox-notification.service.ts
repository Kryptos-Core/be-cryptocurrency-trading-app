import { Injectable, Logger } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { OutboxIntegrationEventType } from '@/common/integration-events/integration-event-catalog';
import type { OnchainDepositOutboxPayloadV1 } from '@/common/integration-events/onchain-deposit-outbox-payload';
import { isOnchainDepositOutboxPayloadV1 } from '@/common/integration-events/onchain-deposit-outbox-payload';
import { unwrapCanonicalIntegrationEventPayload } from '@/common/integration-events/canonical-integration-event-envelope';
import { IntegrationOutbox } from '@/entities/integration-outbox.entity';
import { NotificationRepository } from './repositories/notification.repository';

function parsePayload(row: IntegrationOutbox): OnchainDepositOutboxPayloadV1 | null {
  const envelopePayload = unwrapCanonicalIntegrationEventPayload<OnchainDepositOutboxPayloadV1>(
    row.payload,
  );
  if (isOnchainDepositOutboxPayloadV1(envelopePayload)) return envelopePayload;

  const legacy = row.payload as unknown;
  if (isOnchainDepositOutboxPayloadV1(legacy)) return legacy;

  return null;
}

/**
 * In-app notification for on-chain deposit outbox events.
 * Idempotent: notification_id = integration_outbox.id (PK on notifications prevents double insert under concurrency).
 */
@Injectable()
export class OnchainDepositOutboxNotificationService {
  private readonly logger = new Logger(OnchainDepositOutboxNotificationService.name);

  constructor(private readonly notificationRepo: NotificationRepository) {}

  async applyFromOutboxRow(em: EntityManager, row: IntegrationOutbox): Promise<void> {
    const p = parsePayload(row);
    if (!p) {
      this.logger.warn(`Invalid onchain deposit outbox payload for notification id=${row.id}`);
      throw new Error('INVALID_ONCHAIN_DEPOSIT_OUTBOX_PAYLOAD');
    }

    const isSettled =
      row.event_type === OutboxIntegrationEventType.OnchainDepositSettledV1 ||
      row.event_type === OutboxIntegrationEventType.DepositMatchedV1;
    const title = isSettled ? 'Nạp tiền đã hoàn tất' : 'Nạp tiền đã ghi nhận';
    const body = isSettled
      ? `Giao dịch nạp ${p.chain} đã xác nhận vào ví. Mã: ${p.txId.slice(0, 8)}…`
      : `Đã ghi nhận nạp ${p.chain}. Mã: ${p.txId.slice(0, 8)}…`;

    await this.notificationRepo.createForUserWithManagerIdempotent(em, {
      notificationId: row.id,
      title,
      body,
      type: 'system',
      createdBy: p.userId,
      targetUserId: p.userId,
      data: {
        kind: 'onchain_deposit',
        phase: isSettled ? 'settled' : 'submitted',
        txId: p.txId,
        chain: p.chain,
        txHash: p.txHash,
        outboxEventType: row.event_type,
      },
    });
  }
}
