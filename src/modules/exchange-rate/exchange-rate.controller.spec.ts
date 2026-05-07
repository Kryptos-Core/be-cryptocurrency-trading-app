import { Test, type TestingModule } from '@nestjs/testing';
import { GetExchangeRateQuery } from './application/queries';
import { SyncExchangeRateUseCase, UpdateExchangeRateConfigUseCase } from './application/use-cases';
import { ExchangeRateController } from './exchange-rate.controller';

describe('ExchangeRateController', () => {
  let controller: ExchangeRateController;
  let getExchangeRateQuery: {
    getMarketPrices: jest.Mock;
    getDepositPreview: jest.Mock;
    getAdminCurrentConfig: jest.Mock;
  };
  let syncExchangeRateUseCase: { execute: jest.Mock };
  let updateExchangeRateConfigUseCase: { execute: jest.Mock };

  beforeEach(async () => {
    getExchangeRateQuery = {
      getMarketPrices: jest.fn(),
      getDepositPreview: jest.fn(),
      getAdminCurrentConfig: jest.fn(),
    };
    syncExchangeRateUseCase = { execute: jest.fn() };
    updateExchangeRateConfigUseCase = { execute: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ExchangeRateController],
      providers: [
        { provide: GetExchangeRateQuery, useValue: getExchangeRateQuery },
        { provide: SyncExchangeRateUseCase, useValue: syncExchangeRateUseCase },
        { provide: UpdateExchangeRateConfigUseCase, useValue: updateExchangeRateConfigUseCase },
      ],
    }).compile();

    controller = module.get(ExchangeRateController);
  });

  it('delegates market prices query to service', async () => {
    getExchangeRateQuery.getMarketPrices.mockResolvedValue({
      prices: [],
      updatedAt: '2026-04-14T10:00:00.000Z',
    });

    const result = await controller.getMarketPrices({ symbols: 'BTC,ETH' });

    expect(getExchangeRateQuery.getMarketPrices).toHaveBeenCalledWith({ symbols: 'BTC,ETH' });
    expect(result).toEqual({ prices: [], updatedAt: '2026-04-14T10:00:00.000Z' });
  });

  it('delegates deposit preview query to service', async () => {
    getExchangeRateQuery.getDepositPreview.mockResolvedValue({
      fiatAmount: '500000',
      fiatSymbol: 'VND',
      quoteCurrency: 'USDT',
      grossAmount: '20.00000000',
      spreadBps: '50',
      spreadAmount: '0.10000000',
      netAmount: '19.90000000',
      effectiveRate: '0.00003980',
      marketRate: '0.00004000',
      rateSource: 'manual_override',
      validUntil: '2026-04-14T10:05:00.000Z',
      updatedAt: '2026-04-14T10:00:00.000Z',
    });

    const result = await controller.getDepositPreview({ fiatAmount: '500000', fiatSymbol: 'VND' });

    expect(getExchangeRateQuery.getDepositPreview).toHaveBeenCalledWith({
      fiatAmount: '500000',
      fiatSymbol: 'VND',
    });
    expect(result.netAmount).toBe('19.90000000');
  });

  it('delegates admin config read to service', async () => {
    getExchangeRateQuery.getAdminCurrentConfig.mockResolvedValue({
      fiatToQuoteRate: '0.00004000',
      fxSpreadBps: '50',
      rateSource: 'manual_override',
      marketRate: '0.00003990',
      deviation: '+0.251%',
      lastSyncAt: '2026-04-14T10:00:00.000Z',
      nextDueAt: null,
      lastUpdatedBy: 'finance@example.com',
    });

    const result = await controller.getAdminCurrentConfig();

    expect(getExchangeRateQuery.getAdminCurrentConfig).toHaveBeenCalled();
    expect(result.rateSource).toBe('manual_override');
  });

  it('delegates admin sync to service with actor', async () => {
    syncExchangeRateUseCase.execute.mockResolvedValue({
      previousRate: '0.00004000',
      newRate: '0.00003980',
      source: 'coingecko',
      appliedAt: '2026-04-14T10:00:00.000Z',
    });

    const result = await controller.syncAdminConfig({ source: 'coingecko' }, 'finance-1');

    expect(syncExchangeRateUseCase.execute).toHaveBeenCalledWith(
      { source: 'coingecko' },
      { userId: 'finance-1' },
    );
    expect(result.newRate).toBe('0.00003980');
  });

  it('delegates admin config update to service with actor', async () => {
    updateExchangeRateConfigUseCase.execute.mockResolvedValue({
      fiatToQuoteRate: '0.00004100',
      fxSpreadBps: '100',
      autoSyncEnabled: true,
      autoSyncIntervalMinutes: 15,
      autoSyncSource: 'coingecko',
      rateChangeAlertThresholdPct: 5,
      rateSource: 'auto_sync',
      auditEntryId: 'audit-1',
    });

    const result = await controller.updateAdminConfig(
      {
        fiatToQuoteRate: '0.00004100',
        fxSpreadBps: '100',
        autoSync: true,
        autoSyncIntervalMinutes: 15,
      },
      'finance-1',
    );

    expect(updateExchangeRateConfigUseCase.execute).toHaveBeenCalledWith(
      {
        fiatToQuoteRate: '0.00004100',
        fxSpreadBps: '100',
        autoSync: true,
        autoSyncIntervalMinutes: 15,
      },
      { userId: 'finance-1' },
    );
    expect(result.auditEntryId).toBe('audit-1');
  });
});
