import { Injectable, Logger } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import {
  isTradeExecutedOutboxPayloadV1,
  type TradeExecutedOutboxPayloadV1,
} from '@/common/integration-events/trade-executed-outbox-payload';
import { unwrapCanonicalIntegrationEventPayload } from '@/common/integration-events/canonical-integration-event-envelope';
import { IntegrationOutbox } from '@/entities/integration-outbox.entity';
import { ReadMarketTrade } from '@/entities/read-market-trade.entity';

function parsePayload(row: IntegrationOutbox): TradeExecutedOutboxPayloadV1 | null {
  const envelopePayload = unwrapCanonicalIntegrationEventPayload<TradeExecutedOutboxPayloadV1>(
    row.payload,
  );
  if (isTradeExecutedOutboxPayloadV1(envelopePayload)) return envelopePayload;

  const legacy = row.payload as unknown;
  if (isTradeExecutedOutboxPayloadV1(legacy)) return legacy;

  return null;
}

@Injectable()
export class TradeReadModelSyncApplierService {
  private readonly logger = new Logger(TradeReadModelSyncApplierService.name);

  async applyFromOutboxRow(em: EntityManager, row: IntegrationOutbox): Promise<void> {
    const payload = parsePayload(row);
    if (!payload) {
      this.logger.warn(`Invalid trade executed outbox payload id=${row.id}`);
      throw new Error('INVALID_TRADE_EXECUTED_OUTBOX_PAYLOAD');
    }

    await em.getRepository(ReadMarketTrade).upsert(
      {
        trade_id: payload.tradeId,
        pair_id: payload.pairId,
        maker_order_id: payload.makerOrderId,
        taker_order_id: payload.takerOrderId,
        price: payload.price,
        amount: payload.amount,
        maker_fee: payload.makerFee,
        taker_fee: payload.takerFee,
        fee_currency_id: payload.feeCurrencyId,
        executed_at: new Date(payload.executedAt),
        last_outbox_id: row.id,
      },
      { conflictPaths: ['trade_id'] },
    );
  }
}
