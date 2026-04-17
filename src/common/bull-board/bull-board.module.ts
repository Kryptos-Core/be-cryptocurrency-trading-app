import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { OUTBOX_RELAY_QUEUE } from '@/common/outbox/outbox.constants';
import { MATCHING_QUEUE } from '@/modules/matching/infrastructure/queue/matching-queue.service';
import { PAYMENT_CONFIG_QUEUE } from '@/modules/payment-config/payment-config.service';
import { TREASURY_QUEUE } from '@/modules/treasury/constants';
import { BullBoardService } from './bull-board.service';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: MATCHING_QUEUE },
      { name: TREASURY_QUEUE },
      { name: PAYMENT_CONFIG_QUEUE },
      { name: OUTBOX_RELAY_QUEUE },
    ),
  ],
  providers: [BullBoardService],
  exports: [BullBoardService],
})
export class BullBoardModule {}
