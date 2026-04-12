import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WalletEncryptionService } from '@/common/services';
import { PaymentMethodConfig } from '@/entities/payment-method-config.entity';
import { PaymentConfigController } from './payment-config.controller';
import { PaymentConfigProcessor } from './payment-config.processor';
import { PAYMENT_CONFIG_QUEUE, PaymentConfigService } from './payment-config.service';
import { PaymentConfigGraceScheduler } from './payment-config-grace.scheduler';
import { PaymentConfigRepository } from './repositories/payment-config.repository';

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
