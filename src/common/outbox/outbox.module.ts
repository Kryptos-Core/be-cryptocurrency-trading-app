import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MarketPairReadModelProjectionHandler } from '@/common/read-model/market-pair-read-model.handler';
import { IntegrationOutbox } from '@/entities/integration-outbox.entity';
import { ReadMarketPair } from '@/entities/read-market-pair.entity';
import { RedisModule } from '@/modules/redis/redis.module';
import { OUTBOX_RELAY_QUEUE } from './outbox.constants';
import { OutboxAppender } from './outbox-appender.service';
import { OutboxRelayEnqueueScheduler } from './outbox-relay.enqueue.scheduler';
import { OutboxRelayProcessor } from './outbox-relay.processor';
import { OutboxRelayService } from './outbox-relay.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([IntegrationOutbox, ReadMarketPair]),
    BullModule.registerQueue({ name: OUTBOX_RELAY_QUEUE }),
    RedisModule,
  ],
  providers: [
    OutboxAppender,
    OutboxRelayService,
    OutboxRelayProcessor,
    OutboxRelayEnqueueScheduler,
    MarketPairReadModelProjectionHandler,
  ],
  exports: [OutboxAppender, OutboxRelayService],
})
export class OutboxModule {}
