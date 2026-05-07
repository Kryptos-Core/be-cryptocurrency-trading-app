import { Injectable, Logger } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { unwrapCanonicalIntegrationEventPayload } from '@/common/integration-events/canonical-integration-event-envelope';
import {
  isMarketTickerUpdatedOutboxPayloadV1,
  type MarketTickerUpdatedOutboxPayloadV1,
} from '@/common/integration-events/market-ticker-updated-outbox-payload';
import { IntegrationOutbox } from '@/entities/integration-outbox.entity';
import { ReadMarketTicker } from '@/entities/read-market-ticker.entity';

function parseTickerTimestamp(raw: string): Date | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  const asEpochMs = /^\d+$/.test(trimmed) ? Number(trimmed) : Number.NaN;
  if (Number.isFinite(asEpochMs)) {
    const date = new Date(asEpochMs);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parsePayload(row: IntegrationOutbox): MarketTickerUpdatedOutboxPayloadV1 | null {
  const envelopePayload =
    unwrapCanonicalIntegrationEventPayload<MarketTickerUpdatedOutboxPayloadV1>(row.payload);
  if (isMarketTickerUpdatedOutboxPayloadV1(envelopePayload)) return envelopePayload;

  const legacy = row.payload as unknown;
  if (isMarketTickerUpdatedOutboxPayloadV1(legacy)) return legacy;

  return null;
}

@Injectable()
export class MarketTickerReadModelSyncApplierService {
  private readonly logger = new Logger(MarketTickerReadModelSyncApplierService.name);

  async applyFromOutboxRow(em: EntityManager, row: IntegrationOutbox): Promise<void> {
    const payload = parsePayload(row);
    if (!payload) {
      this.logger.warn(`Invalid market ticker outbox payload id=${row.id}`);
      throw new Error('INVALID_MARKET_TICKER_OUTBOX_PAYLOAD');
    }

    const tickerTimestamp = parseTickerTimestamp(payload.timestamp);
    if (!tickerTimestamp) {
      this.logger.warn(
        `Invalid market ticker timestamp id=${row.id} pairId=${payload.pairId} timestamp=${payload.timestamp}`,
      );
      throw new Error('INVALID_MARKET_TICKER_OUTBOX_TIMESTAMP');
    }

    await em.getRepository(ReadMarketTicker).upsert(
      {
        pair_id: payload.pairId,
        symbol: payload.symbol,
        last_price: payload.lastPrice,
        best_bid: payload.bid,
        best_ask: payload.ask,
        volume_24h: payload.volume24h,
        volume_24h_usd: payload.volume24hUsd,
        change_24h: payload.change24h,
        change_percent_24h: payload.changePercent24h,
        high_24h: payload.high24h,
        low_24h: payload.low24h,
        open_24h: payload.open24h,
        ticker_timestamp: tickerTimestamp,
        last_outbox_id: row.id,
      },
      { conflictPaths: ['pair_id'] },
    );
  }
}
