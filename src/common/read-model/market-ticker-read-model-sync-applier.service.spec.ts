import { MarketTickerReadModelSyncApplierService } from './market-ticker-read-model-sync-applier.service';
import { OutboxIntegrationEventType } from '@/common/integration-events/integration-event-catalog';

describe('MarketTickerReadModelSyncApplierService', () => {
  it('upserts read market ticker from canonical payload', async () => {
    const service = new MarketTickerReadModelSyncApplierService();
    const upsert = jest.fn().mockResolvedValue(undefined);
    const em = { getRepository: jest.fn().mockReturnValue({ upsert }) };

    await service.applyFromOutboxRow(em as never, {
      id: 'outbox-1',
      event_type: OutboxIntegrationEventType.MarketTickerUpdatedV1,
      payload: {
        eventId: 'evt-1',
        eventType: OutboxIntegrationEventType.MarketTickerUpdatedV1,
        aggregateType: 'marketTicker',
        aggregateId: 'pair-1',
        occurredAt: '2026-04-25T10:00:00.000Z',
        schemaVersion: 1,
        payload: {
          pairId: 'pair-1',
          symbol: 'BTC/USDT',
          lastPrice: '65000',
          bid: '64999',
          ask: '65001',
          volume24h: '100',
          volume24hUsd: '6500000',
          change24h: '1000',
          changePercent24h: '1.56',
          high24h: '66000',
          low24h: '64000',
          open24h: '64000',
          timestamp: '2026-04-25T10:00:00.000Z',
        },
      },
    } as never);

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ pair_id: 'pair-1', symbol: 'BTC/USDT', last_outbox_id: 'outbox-1' }),
      { conflictPaths: ['pair_id'] },
    );
  });

  it('throws on invalid payload', async () => {
    const service = new MarketTickerReadModelSyncApplierService();
    const em = { getRepository: jest.fn() };

    await expect(
      service.applyFromOutboxRow(em as never, {
        id: 'outbox-2',
        event_type: OutboxIntegrationEventType.MarketTickerUpdatedV1,
        payload: { invalid: true },
      } as never),
    ).rejects.toThrow('INVALID_MARKET_TICKER_OUTBOX_PAYLOAD');
  });
});
