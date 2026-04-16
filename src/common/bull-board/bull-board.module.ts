import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { MATCHING_QUEUE } from '@/modules/matching/matching-queue.service';
import { PAYMENT_CONFIG_QUEUE } from '@/modules/payment-config/payment-config.service';
import { TREASURY_QUEUE } from '@/modules/treasury/constants';
import { BullBoardService } from './bull-board.service';

/**
 * BullBoardModule — integrates @bull-board/express into NestJS.
 *
 * Exports BullBoardService which mounts the Bull Board UI at `/admin/queues`
 * (admin-only) on application bootstrap.
 *
 * Queues registered:
 * - `matching` — order matching pipeline
 * - `treasury-ops` — treasury fund/sweep operations
 * - `payment-config-activation` — payment config activation scheduler
 *
 * Phase 5.2 — Async Task Resilience
 */
@Module({
    imports: [
        BullModule.registerQueue(
            { name: MATCHING_QUEUE },
            { name: TREASURY_QUEUE },
            { name: PAYMENT_CONFIG_QUEUE },
        ),
    ],
    providers: [BullBoardService],
    exports: [BullBoardService],
})
export class BullBoardModule { }
