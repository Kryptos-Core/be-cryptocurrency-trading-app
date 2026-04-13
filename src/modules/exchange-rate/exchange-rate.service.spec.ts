import { BadRequestException, Logger } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { RedisService } from '@/common/services/redis.service';
import { ExchangeRateAuditLog } from '@/entities/exchange-rate-audit-log.entity';
import { CurrencyRepository } from '@/modules/currencies/repositories';
import { DepositsService } from '@/modules/deposits/deposits.service';
import { PaymentConfigService } from '@/modules/payment-config/payment-config.service';
import { UsersService } from '@/modules/users/users.service';
import { EXCHANGE_RATE_ALERTS_CHANNEL } from '@/modules/exchange-rate/constants';
import { ExchangeRateService } from './exchange-rate.service';
import { CoinGeckoProvider } from './providers/coingecko.provider';
import { FiatRateProvider } from './providers/fiat-rate.provider';

describe('ExchangeRateService', () => {
  let service: ExchangeRateService;
  let coinGeckoProvider: jest.Mocked<CoinGeckoProvider>;
  let fiatRateProvider: jest.Mocked<FiatRateProvider>;
  let depositsService: jest.Mocked<DepositsService>;
  let paymentConfigService: jest.Mocked<PaymentConfigService>;
  let usersService: jest.Mocked<UsersService>;
  let redisService: jest.Mocked<RedisService>;
  let auditRepo: { save: jest.Mock; find: jest.Mock };

  beforeEach(async () => {
    coinGeckoProvider = {
      getMarketPrices: jest.fn(),
      getUsdtVndMarketSnapshot: jest.fn(),
    } as unknown as jest.Mocked<CoinGeckoProvider>;

    fiatRateProvider = {
      getUsdToVndRate: jest.fn(),
    } as unknown as jest.Mocked<FiatRateProvider>;

    depositsService = {
      getCheckoutMeta: jest.fn(),
      getDepositPreview: jest.fn(),
    } as unknown as jest.Mocked<DepositsService>;

    paymentConfigService = {
      getActiveConfig: jest.fn(),
      updateConfig: jest.fn(),
      listConfigs: jest.fn(),
    } as unknown as jest.Mocked<PaymentConfigService>;

    paymentConfigService.listConfigs.mockResolvedValue([
      {
        config_id: 'cfg-1',
        type: 'PAYOS',
        network: 'MAINNET',
        status: 'ACTIVE',
        config_version: 1,
      },
    ] as any);

    usersService = {
      findOne: jest.fn(),
    } as unknown as jest.Mocked<UsersService>;

    redisService = {
      publish: jest.fn(),
    } as unknown as jest.Mocked<RedisService>;

    auditRepo = { save: jest.fn(), find: jest.fn() } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExchangeRateService,
        { provide: CoinGeckoProvider, useValue: coinGeckoProvider },
        { provide: FiatRateProvider, useValue: fiatRateProvider },
        { provide: RedisService, useValue: redisService },
        { provide: DepositsService, useValue: depositsService },
        { provide: PaymentConfigService, useValue: paymentConfigService },
        { provide: UsersService, useValue: usersService },
        { provide: CurrencyRepository, useValue: { findActive: jest.fn() } },
        { provide: getRepositoryToken(ExchangeRateAuditLog), useValue: auditRepo },
      ],
    }).compile();

    service = module.get(ExchangeRateService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns deposit preview with manual source metadata when auto sync disabled', async () => {
    depositsService.getDepositPreview.mockResolvedValue({
      fiatAmount: '500000',
      fiatSymbol: 'VND',
      quoteCurrency: 'USDT',
      grossAmount: '20.00000000',
      spreadBps: '50',
      spreadAmount: '0.10000000',
      netAmount: '19.90000000',
      effectiveRate: '0.00003980',
      validUntil: '2026-04-14T10:05:00.000Z',
    });
    coinGeckoProvider.getUsdtVndMarketSnapshot.mockResolvedValue({
      marketRate: '0.00004000',
      updatedAt: '2026-04-14T10:00:00.000Z',
      source: 'coingecko',
    });
    paymentConfigService.getActiveConfig.mockResolvedValue({
      autoSyncEnabled: false,
    } as any);

    const result = await service.getDepositPreview({ fiatAmount: '500000', fiatSymbol: 'VND' });

    expect(result.marketRate).toBe('0.00004000');
    expect(result.rateSource).toBe('manual_override');
    expect(depositsService.getDepositPreview).toHaveBeenCalledWith('500000', 'VND');
  });

  it('rejects unsupported fiat symbol for preview', async () => {
    await expect(
      service.getDepositPreview({ fiatAmount: '100000', fiatSymbol: 'USD' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('updates payos config and writes audit log', async () => {
    paymentConfigService.getActiveConfig.mockResolvedValue({
      config_id: 'cfg-1',
      clientId: 'client',
      apiKey: 'api',
      checksumKey: 'checksum',
      returnUrl: 'https://example.com/return',
      cancelUrl: 'https://example.com/cancel',
      fiatSymbol: 'VND',
      quoteCurrencySymbol: 'USDT',
      fiatToQuoteRate: '0.00004000',
      fxSpreadBps: '50',
    } as any);
    coinGeckoProvider.getUsdtVndMarketSnapshot.mockResolvedValue({
      marketRate: '0.00003990',
      updatedAt: '2026-04-14T10:00:00.000Z',
      source: 'coingecko',
    });
    paymentConfigService.updateConfig.mockResolvedValue({ config_id: 'cfg-1' } as any);

    const result = await service.updateAdminConfig(
      { fiatToQuoteRate: '0.00004100', fxSpreadBps: '100', reason: 'Promo' },
      { userId: 'user-1' },
    );

    expect(paymentConfigService.updateConfig).toHaveBeenCalledWith(
      'cfg-1',
      expect.objectContaining({
        config: expect.objectContaining({ fiatToQuoteRate: '0.00004100', fxSpreadBps: '100' }),
      }),
      'user-1',
    );
    expect(auditRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'MANUAL_UPDATE',
        previous_rate: '0.00004000',
        new_rate: '0.00004100',
        previous_spread_bps: '50',
        new_spread_bps: '100',
        market_rate: '0.00003990',
        changed_by: 'user-1',
      }),
    );
    expect(result.auditEntryId).toBeDefined();
  });

  it('stores auto-sync config fields during manual update', async () => {
    paymentConfigService.getActiveConfig.mockResolvedValue({
      config_id: 'cfg-1',
      clientId: 'client',
      apiKey: 'api',
      checksumKey: 'checksum',
      returnUrl: 'https://example.com/return',
      cancelUrl: 'https://example.com/cancel',
      fiatSymbol: 'VND',
      quoteCurrencySymbol: 'USDT',
      fiatToQuoteRate: '0.00004000',
      fxSpreadBps: '50',
      autoSyncEnabled: false,
      autoSyncIntervalMinutes: 15,
      autoSyncSource: 'coingecko',
    } as any);
    coinGeckoProvider.getUsdtVndMarketSnapshot.mockResolvedValue({
      marketRate: '0.00003990',
      updatedAt: '2026-04-14T10:00:00.000Z',
      source: 'coingecko',
    });
    paymentConfigService.updateConfig.mockResolvedValue({ config_id: 'cfg-1' } as any);

    await service.updateAdminConfig(
      {
        fiatToQuoteRate: '0.00004100',
        fxSpreadBps: '25',
        autoSync: true,
        autoSyncIntervalMinutes: 10,
      },
      { userId: 'finance-1' },
    );

    expect(paymentConfigService.updateConfig).toHaveBeenCalledWith(
      'cfg-1',
      expect.objectContaining({
        config: expect.objectContaining({
          autoSyncEnabled: true,
          autoSyncIntervalMinutes: 10,
          autoSyncSource: 'coingecko',
          fiatToQuoteRate: '0.00004100',
          fxSpreadBps: '25',
        }),
      }),
      'finance-1',
    );
  });

  it('rejects update when spread is above 10000 bps', async () => {
    paymentConfigService.getActiveConfig.mockResolvedValue({
      config_id: 'cfg-1',
      clientId: 'client',
      apiKey: 'api',
      checksumKey: 'checksum',
      returnUrl: 'https://example.com/return',
      cancelUrl: 'https://example.com/cancel',
      fiatSymbol: 'VND',
      quoteCurrencySymbol: 'USDT',
      fiatToQuoteRate: '0.00004000',
      fxSpreadBps: '50',
    } as any);
    coinGeckoProvider.getUsdtVndMarketSnapshot.mockResolvedValue({
      marketRate: '0.00003990',
      updatedAt: '2026-04-14T10:00:00.000Z',
      source: 'coingecko',
    });

    await expect(
      service.updateAdminConfig({ fxSpreadBps: '10001' }, { userId: 'finance-1' }),
    ).rejects.toThrow(BadRequestException);

    expect(paymentConfigService.updateConfig).not.toHaveBeenCalled();
  });

  it('rejects update when fiatToQuoteRate is zero', async () => {
    paymentConfigService.getActiveConfig.mockResolvedValue({
      config_id: 'cfg-1',
      clientId: 'client',
      apiKey: 'api',
      checksumKey: 'checksum',
      returnUrl: 'https://example.com/return',
      cancelUrl: 'https://example.com/cancel',
      fiatSymbol: 'VND',
      quoteCurrencySymbol: 'USDT',
      fiatToQuoteRate: '0.00004000',
      fxSpreadBps: '50',
    } as any);
    coinGeckoProvider.getUsdtVndMarketSnapshot.mockResolvedValue({
      marketRate: '0.00003990',
      updatedAt: '2026-04-14T10:00:00.000Z',
      source: 'coingecko',
    });

    await expect(
      service.updateAdminConfig({ fiatToQuoteRate: '0' }, { userId: 'finance-1' }),
    ).rejects.toThrow(BadRequestException);

    expect(paymentConfigService.updateConfig).not.toHaveBeenCalled();
  });

  it('returns admin current config with last updater information', async () => {
    paymentConfigService.getActiveConfig.mockResolvedValue({
      config_id: 'cfg-1',
      clientId: 'client',
      apiKey: 'api',
      checksumKey: 'checksum',
      returnUrl: 'https://example.com/return',
      cancelUrl: 'https://example.com/cancel',
      fiatSymbol: 'VND',
      quoteCurrencySymbol: 'USDT',
      fiatToQuoteRate: '0.00004000',
      fxSpreadBps: '50',
      autoSyncEnabled: true,
      autoSyncSource: 'coingecko',
      autoSyncIntervalMinutes: 15,
      lastSyncAt: '2026-04-14T09:55:00.000Z',
    } as any);
    coinGeckoProvider.getUsdtVndMarketSnapshot.mockResolvedValue({
      marketRate: '0.00003985',
      updatedAt: '2026-04-14T10:00:00.000Z',
      source: 'coingecko',
    });
    (auditRepo.find as jest.Mock).mockResolvedValue([
      {
        changed_by: 'user-1',
        created_at: new Date('2026-04-14T10:00:00.000Z'),
      },
    ]);
    usersService.findOne.mockResolvedValue({ email: 'finance@example.com' } as any);

    const result = await service.getAdminCurrentConfig();

    expect(result.rateSource).toBe('auto_sync');
    expect(result.lastSyncAt).toBe('2026-04-14T09:55:00.000Z');
    expect(result.nextDueAt).toBe('2026-04-14T10:10:00.000Z');
    expect(result.lastUpdatedBy).toBe('finance@example.com');
  });

  it('syncs market rate into payos config and records auto-sync audit', async () => {
    paymentConfigService.getActiveConfig.mockResolvedValue({
      config_id: 'cfg-1',
      clientId: 'client',
      apiKey: 'api',
      checksumKey: 'checksum',
      returnUrl: 'https://example.com/return',
      cancelUrl: 'https://example.com/cancel',
      fiatSymbol: 'VND',
      quoteCurrencySymbol: 'USDT',
      fiatToQuoteRate: '0.00004000',
      fxSpreadBps: '50',
    } as any);
    fiatRateProvider.getUsdToVndRate.mockResolvedValue({
      rate: '25100',
      updatedAt: '2026-04-14T10:00:00.000Z',
      source: 'exchangerate_host',
    });
    paymentConfigService.updateConfig.mockResolvedValue({ config_id: 'cfg-1' } as any);

    const result = await service.syncAdminConfig(
      { source: 'exchangerate_host' },
      { userId: 'user-1' },
    );

    expect(result.newRate).toBe('0.00003984');
    expect(paymentConfigService.updateConfig).toHaveBeenCalled();
    expect(auditRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'AUTO_SYNC',
        source: 'exchangerate_host',
        new_rate: '0.00003984',
      }),
    );
  });

  it('skips auto-sync tick when auto sync is disabled', async () => {
    paymentConfigService.getActiveConfig.mockResolvedValue({
      autoSyncEnabled: false,
    } as any);

    const result = await service.runAutoSyncSchedulerTick(new Date('2026-04-14T10:00:00.000Z'));

    expect(result).toEqual({
      status: 'skipped',
      reason: 'auto_sync_disabled',
    });
    expect(paymentConfigService.updateConfig).not.toHaveBeenCalled();
  });

  it('skips auto-sync tick when sync interval is not due', async () => {
    paymentConfigService.getActiveConfig.mockResolvedValue({
      autoSyncEnabled: true,
      autoSyncIntervalMinutes: 15,
      lastSyncAt: '2026-04-14T09:50:00.000Z',
    } as any);

    const result = await service.runAutoSyncSchedulerTick(new Date('2026-04-14T10:00:00.000Z'));

    expect(result).toEqual({
      status: 'skipped',
      reason: 'interval_not_due',
    });
    expect(paymentConfigService.updateConfig).not.toHaveBeenCalled();
  });

  it('runs auto-sync tick when due and emits threshold alert', async () => {
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();

    paymentConfigService.getActiveConfig.mockResolvedValue({
      config_id: 'cfg-1',
      clientId: 'client',
      apiKey: 'api',
      checksumKey: 'checksum',
      returnUrl: 'https://example.com/return',
      cancelUrl: 'https://example.com/cancel',
      fiatSymbol: 'VND',
      quoteCurrencySymbol: 'USDT',
      fiatToQuoteRate: '0.00004000',
      fxSpreadBps: '50',
      autoSyncEnabled: true,
      autoSyncIntervalMinutes: 15,
      autoSyncSource: 'coingecko',
      lastSyncAt: '2026-04-14T09:20:00.000Z',
      rateChangeAlertThresholdPct: 5,
    } as any);
    coinGeckoProvider.getUsdtVndMarketSnapshot.mockResolvedValue({
      marketRate: '0.00003500',
      updatedAt: '2026-04-14T10:00:00.000Z',
      source: 'coingecko',
    });
    paymentConfigService.updateConfig.mockResolvedValue({ config_id: 'cfg-1' } as any);

    const result = await service.runAutoSyncSchedulerTick(new Date('2026-04-14T10:00:00.000Z'));

    expect(result.status).toBe('synced');
    if (result.status !== 'synced') {
      throw new Error('Expected auto-sync tick to run and return synced status');
    }
    expect(result.source).toBe('coingecko');
    expect(result.alerted).toBe(true);
    expect(paymentConfigService.updateConfig).toHaveBeenCalledWith(
      'cfg-1',
      expect.objectContaining({
        config: expect.objectContaining({
          autoSyncEnabled: true,
          autoSyncIntervalMinutes: 15,
          autoSyncSource: 'coingecko',
          lastSyncAt: expect.any(String),
        }),
      }),
      expect.any(String),
    );
    expect(auditRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'AUTO_SYNC',
        source: 'coingecko',
        changed_by: expect.stringMatching(/^.{36}$/),
      }),
    );
    expect(redisService.publish).toHaveBeenCalledTimes(1);
    const [publishedChannel, publishedPayload] = redisService.publish.mock.calls[0];
    expect(publishedChannel).toBe(EXCHANGE_RATE_ALERTS_CHANNEL);
    const payload = JSON.parse(publishedPayload as string);
    expect(payload).toEqual(
      expect.objectContaining({
        event: 'exchange_rate.auto_sync.threshold_alert',
        source: 'coingecko',
        changePct: expect.any(String),
        thresholdPct: '5.000',
        intervalMinutes: 15,
        lastSyncAt: '2026-04-14T10:00:00.000Z',
        nextDueAt: '2026-04-14T10:15:00.000Z',
        timestamp: expect.any(String),
      }),
    );
    expect(warnSpy).toHaveBeenCalled();
  });

  it('skips auto-sync tick when active PayOS config is missing', async () => {
    paymentConfigService.getActiveConfig.mockResolvedValue(null as any);

    const result = await service.runAutoSyncSchedulerTick(new Date('2026-04-14T10:00:00.000Z'));

    expect(result).toEqual({
      status: 'skipped',
      reason: 'payos_config_not_found',
    });
  });
});
