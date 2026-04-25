import { Injectable, Logger } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { OutboxIntegrationEventType } from '@/common/integration-events/integration-event-catalog';
import type { OnchainDepositOutboxPayloadV1 } from '@/common/integration-events/onchain-deposit-outbox-payload';
import { isOnchainDepositOutboxPayloadV1 } from '@/common/integration-events/onchain-deposit-outbox-payload';
import { unwrapCanonicalIntegrationEventPayload } from '@/common/integration-events/canonical-integration-event-envelope';
import { IntegrationOutbox } from '@/entities/integration-outbox.entity';
import { ReadOnchainDeposit } from '@/entities/read-onchain-deposit.entity';

function parsePayload(row: IntegrationOutbox): OnchainDepositOutboxPayloadV1 | null {
  const envelopePayload = unwrapCanonicalIntegrationEventPayload<OnchainDepositOutboxPayloadV1>(
    row.payload,
  );
  if (isOnchainDepositOutboxPayloadV1(envelopePayload)) return envelopePayload;

  const legacy = row.payload as unknown;
  if (isOnchainDepositOutboxPayloadV1(legacy)) return legacy;

  return null;
}

@Injectable()
export class OnchainDepositReadModelSyncApplierService {
  private readonly logger = new Logger(OnchainDepositReadModelSyncApplierService.name);

  async applyFromOutboxRow(em: EntityManager, row: IntegrationOutbox): Promise<void> {
    const p = parsePayload(row);
    if (!p) {
      this.logger.warn(`Invalid onchain deposit outbox payload id=${row.id}`);
      throw new Error('INVALID_ONCHAIN_DEPOSIT_OUTBOX_PAYLOAD');
    }

    switch (row.event_type) {
      case OutboxIntegrationEventType.OnchainDepositSubmittedV1:
        await this.applySubmitted(em, row.id, p);
        return;
      case OutboxIntegrationEventType.OnchainDepositSettledV1:
      case OutboxIntegrationEventType.DepositMatchedV1:
        await this.applySettled(em, row.id, p);
        return;
      default:
        throw new Error(`Unexpected event_type for deposit applier: ${row.event_type}`);
    }
  }

  private async applySubmitted(
    em: EntityManager,
    outboxId: string,
    p: OnchainDepositOutboxPayloadV1,
  ): Promise<void> {
    const createdAt = new Date(p.createdAt);
    const confirmedAt = p.confirmedAt != null ? new Date(p.confirmedAt) : null;

    await em.getRepository(ReadOnchainDeposit).upsert(
      {
        tx_id: p.txId,
        user_id: p.userId,
        chain: p.chain,
        type: 'DEPOSIT',
        tx_hash: p.txHash,
        from_address: p.fromAddress,
        to_address: p.toAddress,
        amount: p.amount,
        status: p.status,
        confirmations: p.confirmations,
        settled: p.settled,
        credited_currency_id: p.creditedCurrencyId ?? null,
        credited_amount: p.creditedAmount ?? null,
        conversion_rate: p.conversionRate ?? null,
        created_at: createdAt,
        confirmed_at: confirmedAt,
        last_outbox_id: outboxId,
      },
      { conflictPaths: ['tx_id'] },
    );
  }

  private async applySettled(
    em: EntityManager,
    outboxId: string,
    p: OnchainDepositOutboxPayloadV1,
  ): Promise<void> {
    const existing = await em
      .getRepository(ReadOnchainDeposit)
      .findOne({ where: { tx_id: p.txId } });
    const createdAt = existing?.created_at ?? new Date(p.createdAt);
    const base = {
      tx_id: p.txId,
      user_id: p.userId,
      chain: p.chain,
      type: 'DEPOSIT',
      tx_hash: p.txHash,
      from_address: p.fromAddress,
      to_address: p.toAddress,
      amount: p.amount,
      status: p.status ?? 'COMPLETED',
      confirmations: p.confirmations,
      settled: true,
      credited_currency_id: p.creditedCurrencyId ?? existing?.credited_currency_id ?? null,
      credited_amount: p.creditedAmount ?? existing?.credited_amount ?? null,
      conversion_rate: p.conversionRate ?? existing?.conversion_rate ?? null,
      created_at: createdAt,
      confirmed_at:
        p.confirmedAt != null ? new Date(p.confirmedAt) : (existing?.confirmed_at ?? new Date()),
      last_outbox_id: outboxId,
    };

    await em.getRepository(ReadOnchainDeposit).upsert(base, { conflictPaths: ['tx_id'] });
  }
}
