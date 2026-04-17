import { InjectQueue } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { Queue } from 'bull';
import { OUTBOX_RELAY_QUEUE } from './outbox.constants';

/**
 * Enqueues periodic outbox drain jobs (processed by {@link OutboxRelayProcessor}).
 */
@Injectable()
export class OutboxRelayEnqueueScheduler {
  private readonly logger = new Logger(OutboxRelayEnqueueScheduler.name);

  constructor(@InjectQueue(OUTBOX_RELAY_QUEUE) private readonly outboxQueue: Queue) {}

  @Cron(CronExpression.EVERY_10_SECONDS, { name: 'outbox-relay-enqueue' })
  async enqueueRelay(): Promise<void> {
    try {
      await this.outboxQueue.add('flush', {}, { removeOnComplete: 50, attempts: 2 });
    } catch (err) {
      this.logger.warn(`Failed to enqueue outbox relay: ${(err as Error).message}`);
    }
  }
}
