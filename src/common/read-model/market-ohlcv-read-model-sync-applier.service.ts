import { Injectable, Logger } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { unwrapCanonicalIntegrationEventPayload } from '@/common/integration-events/canonical-integration-event-envelope';
import {
  isTradeExecutedOutboxPayloadV1,
  type TradeExecutedOutboxPayloadV1,
} from '@/common/integration-events/trade-executed-outbox-payload';
import { IntegrationOutbox } from '@/entities/integration-outbox.entity';
import { ReadMarketOhlcv } from '@/entities/read-market-ohlcv.entity';

const INTERVALS = [60, 300, 900, 3600, 14400, 86400] as const;

function parsePayload(row: IntegrationOutbox): TradeExecutedOutboxPayloadV1 | null {
  const envelopePayload = unwrapCanonicalIntegrationEventPayload<TradeExecutedOutboxPayloadV1>(
    row.payload,
  );
  if (isTradeExecutedOutboxPayloadV1(envelopePayload)) return envelopePayload;

  const legacy = row.payload as unknown;
  if (isTradeExecutedOutboxPayloadV1(legacy)) return legacy;

  return null;
}

function toWindowStart(date: Date, intervalSec: number): Date {
  const ms = intervalSec * 1000;
  return new Date(Math.floor(date.getTime() / ms) * ms);
}

@Injectable()
export class MarketOhlcvReadModelSyncApplierService {
  private readonly logger = new Logger(MarketOhlcvReadModelSyncApplierService.name);

  async applyFromOutboxRow(em: EntityManager, row: IntegrationOutbox): Promise<void> {
    const payload = parsePayload(row);
    if (!payload) {
      this.logger.warn(`Invalid trade executed payload for OHLCV projection id=${row.id}`);
      throw new Error('INVALID_TRADE_EXECUTED_OUTBOX_PAYLOAD');
    }

    const executedAt = new Date(payload.executedAt);
    const price = payload.price;
    const amount = payload.amount;
    const quoteVolume = (Number(payload.price) * Number(payload.amount)).toString();
    const repo = em.getRepository(ReadMarketOhlcv);

    for (const intervalSec of INTERVALS) {
      const openTime = toWindowStart(executedAt, intervalSec);
      const existing = await repo.findOne({
        where: {
          pair_id: payload.pairId,
          interval_sec: intervalSec,
          open_time: openTime,
        },
      });

      if (!existing) {
        await repo.insert({
          pair_id: payload.pairId,
          interval_sec: intervalSec,
          open_time: openTime,
          open: price,
          high: price,
          low: price,
          close: price,
          volume: amount,
          quote_volume: quoteVolume,
          trades_count: 1,
          last_trade_id: payload.tradeId,
          last_outbox_id: row.id,
        });
        continue;
      }

      const high = Math.max(Number(existing.high), Number(price)).toString();
      const low = Math.min(Number(existing.low), Number(price)).toString();
      const volume = (Number(existing.volume) + Number(amount)).toString();
      const nextQuoteVolume = (Number(existing.quote_volume) + Number(quoteVolume)).toString();

      await repo.update(
        {
          pair_id: payload.pairId,
          interval_sec: intervalSec,
          open_time: openTime,
        },
        {
          high,
          low,
          close: price,
          volume,
          quote_volume: nextQuoteVolume,
          trades_count: existing.trades_count + 1,
          last_trade_id: payload.tradeId,
          last_outbox_id: row.id,
        },
      );
    }
  }
}
