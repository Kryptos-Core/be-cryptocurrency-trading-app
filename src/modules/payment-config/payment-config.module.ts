import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WalletEncryptionService } from '@/common/services';
import { PaymentMethodConfig } from '@/entities/payment-method-config.entity';
import { PAYMENT_CONFIG_REPOSITORY } from './domain/ports';
import { PaymentConfigController } from './payment-config.controller';
import { PaymentConfigProcessor } from './payment-config.processor';
import { PAYMENT_CONFIG_QUEUE, PaymentConfigService } from './payment-config.service';
import { PaymentConfigGraceScheduler } from './payment-config-grace.scheduler';
import { PaymentConfigRepository } from './repositories/payment-config.repository';

@Module({
  imports: [
    TypeOrmModule.forFeature([PaymentMethodConfig]),
    BullModule.registerQueue({
      name: PAYMENT_CONFIG_QUEUE,
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 1_000 },
        removeOnComplete: 50,
        removeOnFail: false, // failed jobs stay in Bull's failed set (acts as DLQ)
      },
    }),
  ],
  controllers: [PaymentConfigController],
  providers: [
    PaymentConfigRepository,
    {
      provide: PAYMENT_CONFIG_REPOSITORY,
      useExisting: PaymentConfigRepository,
    },
    PaymentConfigService,
    PaymentConfigProcessor,
    PaymentConfigGraceScheduler,
    WalletEncryptionService,
  ],
  exports: [PaymentConfigService],
})
export class PaymentConfigModule {}
