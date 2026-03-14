import { Module } from '@nestjs/common';
import { DepositsController } from './deposits.controller';
import { DepositsService } from './deposits.service';
import { FiatDepositRepository } from './repositories/fiat-deposit.repository';
import { WalletsModule } from '@/modules/wallets/wallets.module';
import { CurrenciesModule } from '@/modules/currencies/currencies.module';

@Module({
  imports: [WalletsModule, CurrenciesModule],
  controllers: [DepositsController],
  providers: [DepositsService, FiatDepositRepository],
  exports: [DepositsService],
})
export class DepositsModule {}
