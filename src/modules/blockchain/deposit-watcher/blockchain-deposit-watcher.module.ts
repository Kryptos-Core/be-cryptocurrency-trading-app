import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DepositWatcherCursor } from '@/entities/deposit-watcher-cursor.entity';
import { ManagedWalletsModule } from '@/modules/managed-wallets/managed-wallets.module';
import { SystemConfigModule } from '@/modules/system-config/system-config.module';
import { BlockchainModule } from '../blockchain.module';
import { DEPOSIT_WATCHER_QUEUE } from './deposit-watcher.constants';
import { DepositWatcherConfigService } from './deposit-watcher-config.service';
import { DepositWatcherCursorRepository } from './deposit-watcher-cursor.repository';
import { DepositIngestionService } from './deposit-ingestion.service';
import { DepositWatcherProcessor } from './deposit-watcher.processor';
import { DepositWatcherScheduler } from './deposit-watcher.scheduler';
import { DepositWatcherWebhookController } from './deposit-watcher-webhook.controller';
import { EvmDepositObserverService } from './evm-deposit-observer.service';
import { TronDepositObserverService } from './tron-deposit-observer.service';

@Module({
  imports: [
    BlockchainModule,
    ManagedWalletsModule,
    SystemConfigModule,
    TypeOrmModule.forFeature([DepositWatcherCursor]),
    BullModule.registerQueue({
      name: DEPOSIT_WATCHER_QUEUE,
      defaultJobOptions: {
        attempts: 4,
        backoff: { type: 'exponential', delay: 4000 },
        removeOnComplete: 100,
        removeOnFail: 80,
      },
    }),
  ],
  controllers: [DepositWatcherWebhookController],
  providers: [
    DepositWatcherCursorRepository,
    DepositWatcherConfigService,
    DepositIngestionService,
    TronDepositObserverService,
    EvmDepositObserverService,
    DepositWatcherProcessor,
    DepositWatcherScheduler,
  ],
})
export class BlockchainDepositWatcherModule {}
