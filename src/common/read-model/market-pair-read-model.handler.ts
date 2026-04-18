import { EventsHandler, type IEventHandler } from '@nestjs/cqrs';
import { DataSource } from 'typeorm';
import { MarketPairReadModelSyncEvent } from '@/common/integration-events/market-pair-read-model-sync.integration-event';
import { MarketPairReadModelSyncApplierService } from '@/common/read-model/market-pair-read-model-sync-applier.service';

@EventsHandler(MarketPairReadModelSyncEvent)
export class MarketPairReadModelProjectionHandler
  implements IEventHandler<MarketPairReadModelSyncEvent>
{
  constructor(
    private readonly dataSource: DataSource,
    private readonly applier: MarketPairReadModelSyncApplierService,
  ) {}

  async handle(event: MarketPairReadModelSyncEvent): Promise<void> {
    await this.dataSource.transaction(async (em) => {
      await this.applier.apply(em, event.payload);
    });
  }
}
