import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WalletEncryptionService } from '@/common/services';
import { PaymentMethodConfig } from '@/entities/payment-method-config.entity';
import { GetPaymentConfigsQuery } from './application/queries/get-payment-configs.query';
import { ActivatePaymentConfigUseCase } from './application/use-cases/activate-payment-config.use-case';
import { CreatePaymentConfigUseCase } from './application/use-cases/create-payment-config.use-case';
import { DeactivatePaymentConfigUseCase } from './application/use-cases/deactivate-payment-config.use-case';
import { UpdatePaymentConfigUseCase } from './application/use-cases/update-payment-config.use-case';
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
        removeOnFail: false,
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
    GetPaymentConfigsQuery,
    CreatePaymentConfigUseCase,
    UpdatePaymentConfigUseCase,
    ActivatePaymentConfigUseCase,
    DeactivatePaymentConfigUseCase,
  ],
  exports: [PaymentConfigService],
})
export class PaymentConfigModule {}
