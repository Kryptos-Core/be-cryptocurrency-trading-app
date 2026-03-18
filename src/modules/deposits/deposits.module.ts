import { Module } from '@nestjs/common';
import { DepositsController } from './deposits.controller';
import { PayosRedirectController } from './payos-redirect.controller';
import { DepositsService } from './deposits.service';
import { FiatDepositRepository } from './repositories/fiat-deposit.repository';
import { WalletsModule } from '@/modules/wallets/wallets.module';
import { CurrenciesModule } from '@/modules/currencies/currencies.module';
import { PaymentConfigModule } from '@/modules/payment-config/payment-config.module';

@Module({
  imports: [WalletsModule, CurrenciesModule, PaymentConfigModule],
  controllers: [DepositsController, PayosRedirectController],
  providers: [DepositsService, FiatDepositRepository],
  exports: [DepositsService],
})
export class DepositsModule {}
