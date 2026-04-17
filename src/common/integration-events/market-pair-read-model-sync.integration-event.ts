import type { IEvent } from '@nestjs/cqrs';

export interface MarketPairReadModelSyncPayload {
  pairId: string;
  symbol: string;
  baseCurrencyId: string;
  quoteCurrencyId: string;
  isActive: boolean;
}

/**
 * Published after outbox relay — drives read_market_pairs projection (create + update).
 */
export class MarketPairReadModelSyncEvent implements IEvent {
  constructor(
    public readonly outboxId: string,
    public readonly payload: MarketPairReadModelSyncPayload,
  ) {}
}
