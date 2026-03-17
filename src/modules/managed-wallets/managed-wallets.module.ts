import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ManagedWallet } from '@/entities/managed-wallet.entity';
import { AppSetting } from '@/entities/app-setting.entity';
import { OnchainTransaction } from '@/entities/onchain-transaction.entity';
import { CurrencyNetwork } from '@/entities/currency-network.entity';
import { ManagedWalletsService } from './managed-wallets.service';
import { ManagedWalletsController } from './managed-wallets.controller';
import { DepositMethodsController } from './deposit-methods.controller';
import { WalletEncryptionService } from '@/common/services';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ManagedWallet,
      AppSetting,
      OnchainTransaction,
      CurrencyNetwork,
    ]),
  ],
  controllers: [ManagedWalletsController, DepositMethodsController],
  providers: [ManagedWalletsService, WalletEncryptionService],
  exports: [ManagedWalletsService],
})
export class ManagedWalletsModule {}
