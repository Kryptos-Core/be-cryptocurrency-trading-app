import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { PaymentMethodConfig } from '@/entities/payment-method-config.entity';
import { PaymentConfigRepository } from './repositories/payment-config.repository';
import { PaymentConfigService, PAYMENT_CONFIG_QUEUE } from './payment-config.service';
import { PaymentConfigController } from './payment-config.controller';
import { PaymentConfigProcessor } from './payment-config.processor';
import { PaymentConfigGraceScheduler } from './payment-config-grace.scheduler';
import { WalletEncryptionService } from '@/common/services';

/**
 * PaymentConfigModule
 * Provides dynamic payment method configuration management.
 * Exported PaymentConfigService is imported by BlockchainModule and DepositsModule
 * to replace hard-coded .env credentials with live DB values.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([PaymentMethodConfig]),
    BullModule.registerQueue({
      name: PAYMENT_CONFIG_QUEUE,
    }),
  ],
  controllers: [PaymentConfigController],
  providers: [
    PaymentConfigRepository,
    PaymentConfigService,
    PaymentConfigProcessor,
    PaymentConfigGraceScheduler,
    WalletEncryptionService,
  ],
  exports: [PaymentConfigService],
})
export class PaymentConfigModule {}
