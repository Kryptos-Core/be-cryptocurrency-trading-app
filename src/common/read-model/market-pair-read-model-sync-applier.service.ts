import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import type { MarketPairReadModelSyncPayload } from '@/common/integration-events/market-pair-read-model-sync.integration-event';
import { ReadMarketPair } from '@/entities/read-market-pair.entity';

/**
 * Synchronous read-model upsert for market pairs — used by outbox relay (must complete before published_at).
 * {@link MarketPairReadModelProjectionHandler} delegates here so tests can still use EventBus.publish if needed.
 */
@Injectable()
export class MarketPairReadModelSyncApplierService {
  async apply(em: EntityManager, payload: MarketPairReadModelSyncPayload): Promise<void> {
    await em.getRepository(ReadMarketPair).upsert(
      {
        pair_id: payload.pairId,
        symbol: payload.symbol.toUpperCase(),
        base_currency_id: payload.baseCurrencyId,
        quote_currency_id: payload.quoteCurrencyId,
        is_active: payload.isActive,
      },
      { conflictPaths: ['pair_id'] },
    );
  }
}
