import { Module } from '@nestjs/common';
import { CurrenciesModule } from '@/modules/currencies/currencies.module';
import { PaymentConfigModule } from '@/modules/payment-config/payment-config.module';
import { WalletsModule } from '@/modules/wallets/wallets.module';
import { DepositsController } from './deposits.controller';
import { DepositsService } from './deposits.service';
import { FIAT_DEPOSIT_REPOSITORY } from './domain/ports';
import { PayosRedirectController } from './payos-redirect.controller';
import { FiatDepositRepository } from './repositories/fiat-deposit.repository';

@Module({
  imports: [WalletsModule, CurrenciesModule, PaymentConfigModule],
  controllers: [DepositsController, PayosRedirectController],
  providers: [
    FiatDepositRepository,
    {
      provide: FIAT_DEPOSIT_REPOSITORY,
      useExisting: FiatDepositRepository,
    },
    DepositsService,
  ],
  exports: [DepositsService],
})
export class DepositsModule {}
