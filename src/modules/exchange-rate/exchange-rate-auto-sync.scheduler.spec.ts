import { Logger } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { RedisService } from '@/common/services/redis.service';
import { ExchangeRateService } from './exchange-rate.service';
import { ExchangeRateAutoSyncScheduler } from './exchange-rate-auto-sync.scheduler';

describe('ExchangeRateAutoSyncScheduler', () => {
  let scheduler: ExchangeRateAutoSyncScheduler;
  let service: jest.Mocked<ExchangeRateService>;
  let redisService: {
    setIfNotExists: jest.Mock;
    getClient: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      runAutoSyncSchedulerTick: jest.fn(),
    } as unknown as jest.Mocked<ExchangeRateService>;

    redisService = {
      setIfNotExists: jest.fn().mockResolvedValue(true),
      getClient: jest.fn().mockReturnValue({
        eval: jest.fn().mockResolvedValue(1),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExchangeRateAutoSyncScheduler,
        {
          provide: ExchangeRateService,
          useValue: service,
        },
        {
          provide: RedisService,
          useValue: redisService,
        },
      ],
    }).compile();

    scheduler = module.get(ExchangeRateAutoSyncScheduler);
  });

  it('triggers service tick every scheduler run', async () => {
    service.runAutoSyncSchedulerTick.mockResolvedValue({
      status: 'skipped',
      reason: 'interval_not_due',
    });

    await scheduler.handleAutoSyncTick();

    expect(service.runAutoSyncSchedulerTick).toHaveBeenCalledTimes(1);
    expect(redisService.setIfNotExists).toHaveBeenCalledTimes(1);
  });

  it('skips tick when distributed lock is held by another instance', async () => {
    redisService.setIfNotExists.mockResolvedValue(false);

    await scheduler.handleAutoSyncTick();

    expect(service.runAutoSyncSchedulerTick).not.toHaveBeenCalled();
  });

  it('logs scheduler errors and does not throw', async () => {
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    service.runAutoSyncSchedulerTick.mockRejectedValue(new Error('sync failed'));

    await expect(scheduler.handleAutoSyncTick()).resolves.not.toThrow();
    expect(errorSpy).toHaveBeenCalled();
  });
});
