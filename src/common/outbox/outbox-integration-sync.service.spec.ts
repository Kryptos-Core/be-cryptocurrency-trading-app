import { Test } from '@nestjs/testing';
import type { EntityManager } from 'typeorm';
import { OutboxIntegrationEventType } from '@/common/integration-events/integration-event-catalog';
import { IntegrationOutbox } from '@/entities/integration-outbox.entity';
import { OnchainDepositOutboxNotificationService } from '@/modules/notifications/onchain-deposit-outbox-notification.service';
import { MarketPairReadModelSyncApplierService } from '@/common/read-model/market-pair-read-model-sync-applier.service';
import { OnchainDepositReadModelSyncApplierService } from '@/common/read-model/onchain-deposit-read-model-sync-applier.service';
import { ProcessedIntegrationEventsService } from './processed-integration-events.service';
import { OutboxIntegrationSyncService } from './outbox-integration-sync.service';

describe('OutboxIntegrationSyncService', () => {
  let marketPairApplier: { apply: jest.Mock };
  let onchainDepositReadApplier: { applyFromOutboxRow: jest.Mock };
  let onchainDepositNotifications: { applyFromOutboxRow: jest.Mock };
  let processedEvents: { runOnce: jest.Mock };

  beforeEach(() => {
    marketPairApplier = { apply: jest.fn().mockResolvedValue(undefined) };
    onchainDepositReadApplier = { applyFromOutboxRow: jest.fn().mockResolvedValue(undefined) };
    onchainDepositNotifications = { applyFromOutboxRow: jest.fn().mockResolvedValue(undefined) };
    processedEvents = {
      runOnce: jest.fn(async (_em, _consumer, _eventId, _eventType, callback) => {
        await callback();
        return { skipped: false };
      }),
    };
  });

  it('wraps market pair sync with processed-event idempotency', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        OutboxIntegrationSyncService,
        { provide: MarketPairReadModelSyncApplierService, useValue: marketPairApplier },
        {
          provide: OnchainDepositReadModelSyncApplierService,
          useValue: onchainDepositReadApplier,
        },
        {
          provide: OnchainDepositOutboxNotificationService,
          useValue: onchainDepositNotifications,
        },
        { provide: ProcessedIntegrationEventsService, useValue: processedEvents },
      ],
    }).compile();

    const service = moduleRef.get(OutboxIntegrationSyncService);
    const row = {
      id: 'event-1',
      event_type: OutboxIntegrationEventType.MarketPairCreatedV1,
      aggregate_type: 'MarketPair',
      aggregate_id: 'pair-1',
      payload: {
        pairId: 'pair-1',
        symbol: 'BTC/USDT',
        baseCurrencyId: 'btc',
        quoteCurrencyId: 'usdt',
        isActive: true,
      },
    } as unknown as IntegrationOutbox;

    await service.dispatchRow({} as EntityManager, row);

    expect(processedEvents.runOnce).toHaveBeenCalledTimes(1);
    expect(marketPairApplier.apply).toHaveBeenCalledTimes(1);
  });

  it('wraps onchain deposit read model and notification sync independently', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        OutboxIntegrationSyncService,
        { provide: MarketPairReadModelSyncApplierService, useValue: marketPairApplier },
        {
          provide: OnchainDepositReadModelSyncApplierService,
          useValue: onchainDepositReadApplier,
        },
        {
          provide: OnchainDepositOutboxNotificationService,
          useValue: onchainDepositNotifications,
        },
        { provide: ProcessedIntegrationEventsService, useValue: processedEvents },
      ],
    }).compile();

    const service = moduleRef.get(OutboxIntegrationSyncService);
    const row = {
      id: 'event-2',
      event_type: OutboxIntegrationEventType.OnchainDepositSettledV1,
      aggregate_type: 'OnchainDeposit',
      aggregate_id: 'tx-1',
      payload: {
        txId: 'tx-1',
        userId: 'user-1',
        chain: 'TRON_USDT',
        txHash: 'hash-1',
        fromAddress: 'from',
        toAddress: 'to',
        amount: '10',
        status: 'COMPLETED',
        confirmations: 12,
        settled: true,
        createdAt: new Date().toISOString(),
        confirmedAt: new Date().toISOString(),
      },
    } as unknown as IntegrationOutbox;

    await service.dispatchRow({} as EntityManager, row);

    expect(processedEvents.runOnce).toHaveBeenCalledTimes(2);
    expect(onchainDepositReadApplier.applyFromOutboxRow).toHaveBeenCalledTimes(1);
    expect(onchainDepositNotifications.applyFromOutboxRow).toHaveBeenCalledTimes(1);
  });
});

