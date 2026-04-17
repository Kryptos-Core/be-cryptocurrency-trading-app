import { BullAdapter } from '@bull-board/api/bullAdapter';
import { createBullBoard } from '@bull-board/api';
import { ExpressAdapter } from '@bull-board/express';
import { InjectQueue } from '@nestjs/bull';
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { Queue } from 'bull';
import type { Express } from 'express';
import { MATCHING_QUEUE } from '@/modules/matching/infrastructure/queue/matching-queue.service';
import { PAYMENT_CONFIG_QUEUE } from '@/modules/payment-config/payment-config.service';
import { TREASURY_QUEUE } from '@/modules/treasury/constants';

@Injectable()
export class BullBoardService implements OnApplicationBootstrap {
  static readonly PATH = '/admin/queues';

  private readonly logger = new Logger(BullBoardService.name);
  private readonly serverAdapter = new ExpressAdapter();

  constructor(
    private readonly httpAdapterHost: HttpAdapterHost,
    @InjectQueue(MATCHING_QUEUE) private readonly matchingQueue: Queue,
    @InjectQueue(TREASURY_QUEUE) private readonly treasuryQueue: Queue,
    @InjectQueue(PAYMENT_CONFIG_QUEUE) private readonly paymentConfigQueue: Queue,
  ) {}

  onApplicationBootstrap(): void {
    const app = this.httpAdapterHost.httpAdapter.getInstance<Express>();
    this.serverAdapter.setBasePath(BullBoardService.PATH);

    createBullBoard({
      queues: [
        new BullAdapter(this.matchingQueue as any) as any,
        new BullAdapter(this.treasuryQueue as any) as any,
        new BullAdapter(this.paymentConfigQueue as any) as any,
      ],
      serverAdapter: this.serverAdapter,
    });

    app.use(BullBoardService.PATH, this.serverAdapter.getRouter());
    this.logger.log(`Bull Board mounted at ${BullBoardService.PATH}`);
  }
}
