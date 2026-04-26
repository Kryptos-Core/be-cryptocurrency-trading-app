import { BullModule } from '@nestjs/bull';
import { forwardRef, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MarketOhlcvReadModelSyncApplierService } from '@/common/read-model/market-ohlcv-read-model-sync-applier.service';
import { MarketPairReadModelProjectionHandler } from '@/common/read-model/market-pair-read-model.handler';
import { MarketPairReadModelSyncApplierService } from '@/common/read-model/market-pair-read-model-sync-applier.service';
import { MarketTickerReadModelSyncApplierService } from '@/common/read-model/market-ticker-read-model-sync-applier.service';
import { OnchainDepositReadModelSyncApplierService } from '@/common/read-model/onchain-deposit-read-model-sync-applier.service';
import { TradeReadModelSyncApplierService } from '@/common/read-model/trade-read-model-sync-applier.service';
import { IntegrationOutbox } from '@/entities/integration-outbox.entity';
import { ProcessedIntegrationEvent } from '@/entities/processed-integration-event.entity';
import { ReadMarketOhlcv } from '@/entities/read-market-ohlcv.entity';
import { ReadMarketPair } from '@/entities/read-market-pair.entity';
import { ReadMarketTicker } from '@/entities/read-market-ticker.entity';
import { ReadMarketTrade } from '@/entities/read-market-trade.entity';
import { ReadOnchainDeposit } from '@/entities/read-onchain-deposit.entity';
import { NotificationsModule } from '@/modules/notifications/notifications.module';
import { RedisModule } from '@/modules/redis/redis.module';
import { SystemConfigModule } from '@/modules/system-config/system-config.module';
import { TelemetryModule } from '@/telemetry';
import {
  KafkaOutboxEventPublisher,
  KafkaOutboxEventPublisherDriver,
} from './kafka-outbox-event-publisher.service';
import { OutboxAdminController } from './outbox-admin.controller';
import { OutboxAdminService } from './outbox-admin.service';
import {
  DEFAULT_OUTBOX_EVENT_PUBLISHER_DRIVER,
  OUTBOX_EVENT_PUBLISHER,
  OUTBOX_RELAY_QUEUE,
} from './outbox.constants';
import {
  NoopOutboxEventPublisher,
  NoopOutboxEventPublisherDriver,
} from './noop-outbox-event-publisher.service';
import type { OutboxEventPublisher } from './outbox-event-publisher.port';
import { OutboxAppender } from './outbox-appender.service';
import { OutboxIntegrationSyncService } from './outbox-integration-sync.service';
import { ProcessedIntegrationEventsService } from './processed-integration-events.service';
import { OutboxRelayEnqueueScheduler } from './outbox-relay.enqueue.scheduler';
import { OutboxReplayAuditService } from './outbox-replay-audit.service';
import { OutboxRelayProcessor } from './outbox-relay.processor';
import { OutboxRelayService } from './outbox-relay.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      IntegrationOutbox,
      ProcessedIntegrationEvent,
      ReadMarketPair,
      ReadMarketTrade,
      ReadMarketTicker,
      ReadMarketOhlcv,
      ReadOnchainDeposit,
    ]),
    BullModule.registerQueue({ name: OUTBOX_RELAY_QUEUE }),
    RedisModule,
    TelemetryModule,
    forwardRef(() => NotificationsModule),
    SystemConfigModule,
  ],
  providers: [
    OutboxAppender,
    ProcessedIntegrationEventsService,
    MarketPairReadModelSyncApplierService,
    OnchainDepositReadModelSyncApplierService,
    TradeReadModelSyncApplierService,
    MarketTickerReadModelSyncApplierService,
    MarketOhlcvReadModelSyncApplierService,
    OutboxAdminService,
    OutboxIntegrationSyncService,
    OutboxRelayService,
    OutboxRelayProcessor,
    OutboxRelayEnqueueScheduler,
    OutboxReplayAuditService,
    MarketPairReadModelProjectionHandler,
    NoopOutboxEventPublisher,
    NoopOutboxEventPublisherDriver,
    KafkaOutboxEventPublisher,
    KafkaOutboxEventPublisherDriver,
    {
      provide: OUTBOX_EVENT_PUBLISHER,
      inject: [
        ConfigService,
        NoopOutboxEventPublisherDriver,
        KafkaOutboxEventPublisherDriver,
      ],
      useFactory: async (
        configService: ConfigService,
        noopDriver: NoopOutboxEventPublisherDriver,
        kafkaDriver: KafkaOutboxEventPublisherDriver,
      ): Promise<OutboxEventPublisher> => {
        const driverName =
          (configService.get<string>('EVENT_PUBLISHER_DRIVER') ??
            DEFAULT_OUTBOX_EVENT_PUBLISHER_DRIVER)
            .trim()
            .toLowerCase();

        const drivers = [noopDriver, kafkaDriver];
        const matched = drivers.find((driver) => driver.supports(driverName));
        if (!matched) {
          throw new Error(`Unsupported EVENT_PUBLISHER_DRIVER: ${driverName}`);
        }

        return matched.create();
      },
    },
  ],
  controllers: [OutboxAdminController],
  exports: [OutboxAppender, OutboxRelayService, OUTBOX_EVENT_PUBLISHER, OutboxAdminService],
})
export class OutboxModule {}



