import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MarketPairReadModelSyncApplierService } from '@/common/read-model/market-pair-read-model-sync-applier.service';
import { MarketPairReadModelProjectionHandler } from '@/common/read-model/market-pair-read-model.handler';
import { OnchainDepositReadModelSyncApplierService } from '@/common/read-model/onchain-deposit-read-model-sync-applier.service';
import { IntegrationOutbox } from '@/entities/integration-outbox.entity';
import { ReadMarketPair } from '@/entities/read-market-pair.entity';
import { ReadOnchainDeposit } from '@/entities/read-onchain-deposit.entity';
import { NotificationsModule } from '@/modules/notifications/notifications.module';
import { RedisModule } from '@/modules/redis/redis.module';
import { OUTBOX_RELAY_QUEUE } from './outbox.constants';
import { OutboxAppender } from './outbox-appender.service';
import { OutboxIntegrationSyncService } from './outbox-integration-sync.service';
import { OutboxRelayEnqueueScheduler } from './outbox-relay.enqueue.scheduler';
import { OutboxRelayProcessor } from './outbox-relay.processor';
import { OutboxRelayService } from './outbox-relay.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([IntegrationOutbox, ReadMarketPair, ReadOnchainDeposit]),
    BullModule.registerQueue({ name: OUTBOX_RELAY_QUEUE }),
    RedisModule,
    NotificationsModule,
  ],
  providers: [
    OutboxAppender,
    MarketPairReadModelSyncApplierService,
    OnchainDepositReadModelSyncApplierService,
    OutboxIntegrationSyncService,
    OutboxRelayService,
    OutboxRelayProcessor,
    OutboxRelayEnqueueScheduler,
    MarketPairReadModelProjectionHandler,
  ],
  exports: [OutboxAppender, OutboxRelayService],
})
export class OutboxModule {}
