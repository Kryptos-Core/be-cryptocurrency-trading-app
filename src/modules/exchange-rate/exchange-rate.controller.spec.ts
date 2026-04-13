import { Test, type TestingModule } from '@nestjs/testing';
import { ExchangeRateController } from './exchange-rate.controller';
import { ExchangeRateService } from './exchange-rate.service';

describe('ExchangeRateController', () => {
  let controller: ExchangeRateController;
  let service: jest.Mocked<ExchangeRateService>;

  beforeEach(async () => {
    const mockService = {
      getMarketPrices: jest.fn(),
      getDepositPreview: jest.fn(),
      getAdminCurrentConfig: jest.fn(),
      syncAdminConfig: jest.fn(),
      updateAdminConfig: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ExchangeRateController],
      providers: [{ provide: ExchangeRateService, useValue: mockService }],
    }).compile();

    controller = module.get(ExchangeRateController);
    service = module.get(ExchangeRateService);
  });

  it('delegates market prices query to service', async () => {
    service.getMarketPrices.mockResolvedValue({ prices: [], updatedAt: '2026-04-14T10:00:00.000Z' });

    const result = await controller.getMarketPrices({ symbols: 'BTC,ETH' });

    expect(service.getMarketPrices).toHaveBeenCalledWith({ symbols: 'BTC,ETH' });
    expect(result).toEqual({ prices: [], updatedAt: '2026-04-14T10:00:00.000Z' });
  });

  it('delegates deposit preview query to service', async () => {
    service.getDepositPreview.mockResolvedValue({
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

    expect(service.getDepositPreview).toHaveBeenCalledWith({ fiatAmount: '500000', fiatSymbol: 'VND' });
    expect(result.netAmount).toBe('19.90000000');
  });

  it('delegates admin config read to service', async () => {
    service.getAdminCurrentConfig.mockResolvedValue({
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

    expect(service.getAdminCurrentConfig).toHaveBeenCalled();
    expect(result.rateSource).toBe('manual_override');
  });

  it('delegates admin sync to service with actor', async () => {
    service.syncAdminConfig.mockResolvedValue({
      previousRate: '0.00004000',
      newRate: '0.00003980',
      source: 'coingecko',
      appliedAt: '2026-04-14T10:00:00.000Z',
    });

    const result = await controller.syncAdminConfig({ source: 'coingecko' }, 'finance-1');

    expect(service.syncAdminConfig).toHaveBeenCalledWith({ source: 'coingecko' }, { userId: 'finance-1' });
    expect(result.newRate).toBe('0.00003980');
  });

  it('delegates admin config update to service with actor', async () => {
    service.updateAdminConfig.mockResolvedValue({
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
      { fiatToQuoteRate: '0.00004100', fxSpreadBps: '100', autoSync: true, autoSyncIntervalMinutes: 15 },
      'finance-1',
    );

    expect(service.updateAdminConfig).toHaveBeenCalledWith(
      { fiatToQuoteRate: '0.00004100', fxSpreadBps: '100', autoSync: true, autoSyncIntervalMinutes: 15 },
      { userId: 'finance-1' },
    );
    expect(result.auditEntryId).toBe('audit-1');
  });
});
