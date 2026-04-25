import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Job } from 'bull';
import { OUTBOX_RELAY_QUEUE } from './outbox.constants';
import { OutboxRelayService } from './outbox-relay.service';

@Processor(OUTBOX_RELAY_QUEUE)
export class OutboxRelayProcessor {
  private readonly logger = new Logger(OutboxRelayProcessor.name);

  constructor(
    private readonly outboxRelay: OutboxRelayService,
    private readonly configService: ConfigService,
  ) {}

  @Process('flush')
  async handleFlush(_job: Job): Promise<void> {
    const enabled =
      String(this.configService.get<string>('EVENT_OUTBOX_ENABLED') ?? 'true').toLowerCase() !==
      'false';
    if (!enabled) return;

    const { published } = await this.outboxRelay.flushOnce();
    if (published > 0) {
      this.logger.debug(`Outbox relay published ${published} message(s)`);
    }
  }
}
