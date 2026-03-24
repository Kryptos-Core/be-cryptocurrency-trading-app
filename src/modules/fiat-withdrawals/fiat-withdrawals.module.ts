import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserBankAccount } from '@/entities/user-bank-account.entity';
import { FiatWithdrawalRequest } from '@/entities/fiat-withdrawal-request.entity';
import { WalletsModule } from '@/modules/wallets/wallets.module';
import { CurrenciesModule } from '@/modules/currencies/currencies.module';
import { WalletEncryptionService } from '@/common/services';
import { FiatWithdrawalsService } from './fiat-withdrawals.service';
import { FiatWithdrawalsController } from './fiat-withdrawals.controller';
import { FiatWithdrawalsAdminController } from './fiat-withdrawals-admin.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserBankAccount, FiatWithdrawalRequest]),
    WalletsModule,
    CurrenciesModule,
  ],
  providers: [FiatWithdrawalsService, WalletEncryptionService],
  controllers: [FiatWithdrawalsController, FiatWithdrawalsAdminController],
  exports: [FiatWithdrawalsService],
})
export class FiatWithdrawalsModule {}
