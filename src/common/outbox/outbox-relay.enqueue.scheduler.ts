import { InjectQueue } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { Queue } from 'bull';
import { OUTBOX_RELAY_QUEUE } from './outbox.constants';

/**
 * Enqueues periodic outbox drain jobs (processed by {@link OutboxRelayProcessor}).
 */
@Injectable()
export class OutboxRelayEnqueueScheduler {
  private readonly logger = new Logger(OutboxRelayEnqueueScheduler.name);

  constructor(
    @InjectQueue(OUTBOX_RELAY_QUEUE) private readonly outboxQueue: Queue,
    private readonly configService: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_10_SECONDS, { name: 'outbox-relay-enqueue' })
  async enqueueRelay(): Promise<void> {
    const enabled =
      String(this.configService.get<string>('EVENT_OUTBOX_ENABLED') ?? 'true').toLowerCase() !==
      'false';
    if (!enabled) return;

    try {
      await this.outboxQueue.add('flush', {}, { removeOnComplete: 50, attempts: 2 });
    } catch (err) {
      this.logger.warn(`Failed to enqueue outbox relay: ${(err as Error).message}`);
    }
  }
}
