import { OutboxIntegrationEventType } from '@/common/integration-events/integration-event-catalog';
import { MarketTickerReadModelSyncApplierService } from './market-ticker-read-model-sync-applier.service';

describe('MarketTickerReadModelSyncApplierService', () => {
  it('upserts read market ticker from canonical payload', async () => {
    const service = new MarketTickerReadModelSyncApplierService();
    const upsert = jest.fn().mockResolvedValue(undefined);
    const em = { getRepository: jest.fn().mockReturnValue({ upsert }) };

    await service.applyFromOutboxRow(
      em as never,
      {
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
      } as never,
    );

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        pair_id: 'pair-1',
        symbol: 'BTC/USDT',
        last_outbox_id: 'outbox-1',
      }),
      { conflictPaths: ['pair_id'] },
    );
  });

  it('accepts epoch-millisecond timestamp strings from legacy ticker payloads', async () => {
    const service = new MarketTickerReadModelSyncApplierService();
    const upsert = jest.fn().mockResolvedValue(undefined);
    const em = { getRepository: jest.fn().mockReturnValue({ upsert }) };

    await service.applyFromOutboxRow(
      em as never,
      {
        id: 'outbox-legacy-ms',
        event_type: OutboxIntegrationEventType.MarketTickerUpdatedV1,
        payload: {
          pairId: 'pair-legacy',
          symbol: 'ETH/USDT',
          lastPrice: '3000',
          bid: '2999',
          ask: '3001',
          volume24h: '200',
          volume24hUsd: '600000',
          change24h: '50',
          changePercent24h: '1.7',
          high24h: '3100',
          low24h: '2900',
          open24h: '2950',
          timestamp: '1714080000000',
        },
      } as never,
    );

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        pair_id: 'pair-legacy',
        ticker_timestamp: new Date(1714080000000),
      }),
      { conflictPaths: ['pair_id'] },
    );
  });

  it('throws on invalid timestamp payload', async () => {
    const service = new MarketTickerReadModelSyncApplierService();
    const upsert = jest.fn().mockResolvedValue(undefined);
    const em = { getRepository: jest.fn().mockReturnValue({ upsert }) };

    await expect(
      service.applyFromOutboxRow(
        em as never,
        {
          id: 'outbox-invalid-ts',
          event_type: OutboxIntegrationEventType.MarketTickerUpdatedV1,
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
            timestamp: 'NaN',
          },
        } as never,
      ),
    ).rejects.toThrow('INVALID_MARKET_TICKER_OUTBOX_TIMESTAMP');

    expect(upsert).not.toHaveBeenCalled();
  });

  it('throws on invalid payload', async () => {
    const service = new MarketTickerReadModelSyncApplierService();
    const em = { getRepository: jest.fn() };

    await expect(
      service.applyFromOutboxRow(
        em as never,
        {
          id: 'outbox-2',
          event_type: OutboxIntegrationEventType.MarketTickerUpdatedV1,
          payload: { invalid: true },
        } as never,
      ),
    ).rejects.toThrow('INVALID_MARKET_TICKER_OUTBOX_PAYLOAD');
  });
});
