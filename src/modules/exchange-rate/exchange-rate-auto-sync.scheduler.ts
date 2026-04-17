import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RedisService } from '@/common/services/redis.service';
import { ExchangeRateService } from './exchange-rate.service';

const AUTO_SYNC_LOCK_KEY = 'exchange_rate:auto_sync:lock';
const AUTO_SYNC_LOCK_TTL_SECONDS = 55;
const RELEASE_LOCK_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`;

@Injectable()
export class ExchangeRateAutoSyncScheduler {
  private readonly logger = new Logger(ExchangeRateAutoSyncScheduler.name);
  private isTickRunning = false;

  constructor(
    private readonly exchangeRateService: ExchangeRateService,
    private readonly redisService: RedisService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE, {
    name: 'exchange-rate-auto-sync',
    timeZone: 'UTC',
  })
  async handleAutoSyncTick(): Promise<void> {
    if (this.isTickRunning) {
      this.logger.warn('[ExchangeRateAutoSyncScheduler] Previous tick is still running, skipping');
      return;
    }

    const lockToken = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    this.isTickRunning = true;
    let hasDistributedLock = false;
    try {
      hasDistributedLock = await this.redisService.setIfNotExists(
        AUTO_SYNC_LOCK_KEY,
        lockToken,
        AUTO_SYNC_LOCK_TTL_SECONDS,
      );
      if (!hasDistributedLock) {
        this.logger.log(
          '[ExchangeRateAutoSyncScheduler] Tick skipped because lock is held by another instance',
        );
        return;
      }

      const result = await this.exchangeRateService.runAutoSyncSchedulerTick();
      if (result.status === 'synced') {
        this.logger.log(
          `[ExchangeRateAutoSyncScheduler] Synced source=${result.source} prev=${result.previousRate} next=${result.newRate}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `[ExchangeRateAutoSyncScheduler] handleAutoSyncTick: ${(error as Error).message}`,
      );
    } finally {
      if (hasDistributedLock) {
        await this.releaseDistributedLock(lockToken);
      }
      this.isTickRunning = false;
    }
  }

  private async releaseDistributedLock(lockToken: string): Promise<void> {
    try {
      await this.redisService
        .getClient()
        .eval(RELEASE_LOCK_SCRIPT, 1, AUTO_SYNC_LOCK_KEY, lockToken);
    } catch (error) {
      this.logger.error(
        `[ExchangeRateAutoSyncScheduler] releaseDistributedLock: ${(error as Error).message}`,
      );
    }
  }
}
