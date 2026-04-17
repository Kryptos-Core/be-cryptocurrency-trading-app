import { EventsHandler, type IEventHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MarketPairReadModelSyncEvent } from '@/common/integration-events/market-pair-read-model-sync.integration-event';
import { ReadMarketPair } from '@/entities/read-market-pair.entity';

@EventsHandler(MarketPairReadModelSyncEvent)
export class MarketPairReadModelProjectionHandler
  implements IEventHandler<MarketPairReadModelSyncEvent>
{
  constructor(
    @InjectRepository(ReadMarketPair)
    private readonly readRepo: Repository<ReadMarketPair>,
  ) {}

  async handle(event: MarketPairReadModelSyncEvent): Promise<void> {
    const p = event.payload;
    await this.readRepo.upsert(
      {
        pair_id: p.pairId,
        symbol: p.symbol.toUpperCase(),
        base_currency_id: p.baseCurrencyId,
        quote_currency_id: p.quoteCurrencyId,
        is_active: p.isActive,
      },
      { conflictPaths: ['pair_id'] },
    );
  }
}
