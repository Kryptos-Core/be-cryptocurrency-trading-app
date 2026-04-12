import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { PaymentConfigService } from './payment-config.service';

/**
 * Ensures grace-period activations complete even if Bull delayed jobs never run
 * (Redis unavailable, worker crash, exhausted retries).
 */
@Injectable()
export class PaymentConfigGraceScheduler {
  private readonly logger = new Logger(PaymentConfigGraceScheduler.name);

  constructor(private readonly paymentConfigService: PaymentConfigService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async flushExpiredGraceActivations(): Promise<void> {
    try {
      await this.paymentConfigService.flushStaleTransitioningActivations();
    } catch (e) {
      this.logger.error(`flushExpiredGraceActivations: ${(e as Error).message}`);
    }
  }
}
