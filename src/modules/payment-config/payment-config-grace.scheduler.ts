import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RedisService } from '@/common/services/redis.service';
import { withDistributedLock } from '@/common/utils/redis-distributed-lock';
import { PaymentConfigService } from './payment-config.service';

const GRACE_LOCK_KEY = 'payment_config:grace_scheduler:lock';
const GRACE_LOCK_TTL_SECONDS = 50; // Shorter than the 60 s cron interval

/**
 * Ensures grace-period activations complete even if Bull delayed jobs never run
 * (Redis unavailable, worker crash, exhausted retries).
 *
 * Distributed lock prevents duplicate execution across multiple API instances.
 */
@Injectable()
export class PaymentConfigGraceScheduler {
  private readonly logger = new Logger(PaymentConfigGraceScheduler.name);

  constructor(
    private readonly paymentConfigService: PaymentConfigService,
    private readonly redisService: RedisService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE, {
    name: 'payment-config-grace-flush',
    timeZone: 'UTC',
  })
  async flushExpiredGraceActivations(): Promise<void> {
    await withDistributedLock(
      this.redisService,
      {
        lockKey: GRACE_LOCK_KEY,
        ttlSeconds: GRACE_LOCK_TTL_SECONDS,
        callerName: PaymentConfigGraceScheduler.name,
      },
      async () => {
        await this.paymentConfigService.flushStaleTransitioningActivations();
      },
      this.logger,
    ).catch((e: Error) => {
      this.logger.error(`flushExpiredGraceActivations: ${e.message}`);
    });
  }
}
