import { OutboxIntegrationEventType } from '@/common/integration-events/integration-event-catalog';
import { TradeReadModelSyncApplierService } from './trade-read-model-sync-applier.service';

describe('TradeReadModelSyncApplierService', () => {
  it('upserts read market trade from canonical envelope payload', async () => {
    const service = new TradeReadModelSyncApplierService();
    const upsert = jest.fn().mockResolvedValue(undefined);
    const em = {
      getRepository: jest.fn().mockReturnValue({ upsert }),
    };

    await service.applyFromOutboxRow(
      em as never,
      {
        id: 'outbox-1',
        event_type: OutboxIntegrationEventType.TradeExecutedV1,
        payload: {
          eventId: 'evt-1',
          eventType: OutboxIntegrationEventType.TradeExecutedV1,
          aggregateType: 'trade',
          aggregateId: 'trade-1',
          occurredAt: '2026-04-25T10:00:00.000Z',
          schemaVersion: 1,
          payload: {
            tradeId: 'trade-1',
            pairId: 'pair-1',
            makerOrderId: 'maker-1',
            takerOrderId: 'taker-1',
            price: '123.45',
            amount: '0.5',
            makerFee: '0.01',
            takerFee: '0.02',
            feeCurrencyId: 'usdt',
            executedAt: '2026-04-25T10:00:00.000Z',
          },
        },
      } as never,
    );

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        trade_id: 'trade-1',
        pair_id: 'pair-1',
        maker_order_id: 'maker-1',
        taker_order_id: 'taker-1',
        last_outbox_id: 'outbox-1',
      }),
      { conflictPaths: ['trade_id'] },
    );
  });

  it('throws on invalid payload', async () => {
    const service = new TradeReadModelSyncApplierService();
    const em = {
      getRepository: jest.fn(),
    };

    await expect(
      service.applyFromOutboxRow(
        em as never,
        {
          id: 'outbox-2',
          event_type: OutboxIntegrationEventType.TradeExecutedV1,
          payload: { invalid: true },
        } as never,
      ),
    ).rejects.toThrow('INVALID_TRADE_EXECUTED_OUTBOX_PAYLOAD');
  });
});
