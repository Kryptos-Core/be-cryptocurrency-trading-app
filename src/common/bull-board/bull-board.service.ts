import { ExpressAdapter } from '@bull-board/express';
import { InjectQueue } from '@nestjs/bull';
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { Queue } from 'bull';
import type { Express } from 'express';

// BullAdapter wraps a Bull Queue for the Bull Board UI
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { BullAdapter } = require('@bull-board/api/bullAdapter') as {
    BullAdapter: new (q: Queue) => import('@bull-board/api/dist/queueAdapters/base').BaseAdapter;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createBullBoard } = require('@bull-board/api') as {
    createBullBoard: (opts: {
        queues: import('@bull-board/api/dist/queueAdapters/base').BaseAdapter[];
        serverAdapter: ExpressAdapter;
    }) => void;
};

import { MATCHING_QUEUE } from '@/modules/matching/matching-queue.service';
import { PAYMENT_CONFIG_QUEUE } from '@/modules/payment-config/payment-config.service';
import { TREASURY_QUEUE } from '@/modules/treasury/constants';

/**
 * BullBoardService — builds and mounts the Bull Board UI at `/admin/queues`.
 *
 * Uses @bull-board/express ExpressAdapter as the server adapter and
 * BullAdapter from @bull-board/api to wrap Bull Queue instances.
 * The router is mounted on the Express application via HttpAdapterHost.
 *
 * Queues registered via BullModule.registerQueue() are injected here and
 * wrapped so the UI can show job counts, failed jobs (DLQ), and retry controls.
 *
 * Phase 5.2 — Async Task Resilience
 */
@Injectable()
export class BullBoardService implements OnApplicationBootstrap {
    private readonly logger = new Logger(BullBoardService.name);

    /** Bull Board admin path — NOT under /api prefix. */
    static readonly PATH = '/admin/queues';

    constructor(
        private readonly httpAdapterHost: HttpAdapterHost,
        @InjectQueue(MATCHING_QUEUE) private readonly matchingQueue: Queue,
        @InjectQueue(TREASURY_QUEUE) private readonly treasuryQueue: Queue,
        @InjectQueue(PAYMENT_CONFIG_QUEUE) private readonly paymentConfigQueue: Queue,
    ) { }

    async onApplicationBootstrap(): Promise<void> {
        const { httpAdapter } = this.httpAdapterHost;
        if (!httpAdapter) {
            this.logger.warn('Bull Board: httpAdapter not available, skipping UI mount');
            return;
        }

        const instance = httpAdapter.getInstance<Express>();
        if (!instance) {
            this.logger.warn('Bull Board: Express instance not found, skipping UI mount');
            return;
        }

        const serverAdapter = new ExpressAdapter();
        serverAdapter.setBasePath(BullBoardService.PATH);

        // Build Bull Board with all three queues
        createBullBoard({
            queues: [
                new BullAdapter(this.matchingQueue),
                new BullAdapter(this.treasuryQueue),
                new BullAdapter(this.paymentConfigQueue),
            ],
            serverAdapter,
        });

        // Mount Bull Board UI at /admin/queues
        instance.use(BullBoardService.PATH, serverAdapter.getRouter());

        this.logger.log(
            `Bull Board mounted at ${BullBoardService.PATH} — queues: ${MATCHING_QUEUE}, ${TREASURY_QUEUE}, ${PAYMENT_CONFIG_QUEUE}`,
        );
    }
}
