import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MarketPairReadModelProjectionHandler } from '@/common/read-model/market-pair-read-model.handler';
import { MarketPairReadModelSyncApplierService } from '@/common/read-model/market-pair-read-model-sync-applier.service';
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
    BullModule.registerQueueAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const enabled =
          String(config.get<string>('EVENT_OUTBOX_ENABLED') ?? 'true').toLowerCase() !== 'false';
        return {
          name: OUTBOX_RELAY_QUEUE,
          defaultJobOptions: {
            removeOnComplete: enabled ? 50 : 1,
          },
        };
      },
    }),
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
