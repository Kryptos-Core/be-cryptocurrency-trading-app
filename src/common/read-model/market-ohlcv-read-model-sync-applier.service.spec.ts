import { OutboxIntegrationEventType } from '@/common/integration-events/integration-event-catalog';
import { MarketOhlcvReadModelSyncApplierService } from './market-ohlcv-read-model-sync-applier.service';

describe('MarketOhlcvReadModelSyncApplierService', () => {
  it('creates OHLCV rows for a first trade across configured intervals', async () => {
    const service = new MarketOhlcvReadModelSyncApplierService();
    const findOne = jest.fn().mockResolvedValue(null);
    const insert = jest.fn().mockResolvedValue(undefined);
    const update = jest.fn().mockResolvedValue(undefined);
    const em = { getRepository: jest.fn().mockReturnValue({ findOne, insert, update }) };

    await service.applyFromOutboxRow(
      em as never,
      {
        id: 'outbox-1',
        event_type: OutboxIntegrationEventType.TradeExecutedV1,
        payload: {
          tradeId: 'trade-1',
          pairId: 'pair-1',
          makerOrderId: 'maker-1',
          takerOrderId: 'taker-1',
          price: '100',
          amount: '0.5',
          makerFee: '0',
          takerFee: '0',
          feeCurrencyId: 'usdt',
          executedAt: '2026-04-25T10:03:00.000Z',
        },
      } as never,
    );

    expect(insert).toHaveBeenCalledTimes(6);
    expect(update).not.toHaveBeenCalled();
  });

  it('updates OHLCV row when candle already exists', async () => {
    const service = new MarketOhlcvReadModelSyncApplierService();
    const findOne = jest.fn().mockResolvedValue({
      high: '90',
      low: '80',
      volume: '1',
      quote_volume: '85',
      trades_count: 2,
    });
    const insert = jest.fn().mockResolvedValue(undefined);
    const update = jest.fn().mockResolvedValue(undefined);
    const em = { getRepository: jest.fn().mockReturnValue({ findOne, insert, update }) };

    await service.applyFromOutboxRow(
      em as never,
      {
        id: 'outbox-2',
        event_type: OutboxIntegrationEventType.TradeExecutedV1,
        payload: {
          tradeId: 'trade-2',
          pairId: 'pair-1',
          makerOrderId: 'maker-1',
          takerOrderId: 'taker-1',
          price: '100',
          amount: '0.5',
          makerFee: '0',
          takerFee: '0',
          feeCurrencyId: 'usdt',
          executedAt: '2026-04-25T10:03:00.000Z',
        },
      } as never,
    );

    expect(update).toHaveBeenCalledTimes(6);
    expect(insert).not.toHaveBeenCalled();
  });
});
