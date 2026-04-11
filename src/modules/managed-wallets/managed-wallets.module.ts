import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppSetting } from '@/entities/app-setting.entity';
import { OnchainTransaction } from '@/entities/onchain-transaction.entity';
import { CurrencyNetwork } from '@/entities/currency-network.entity';
import { ManagedWalletsService } from './managed-wallets.service';
import { ManagedWalletsDataRepository } from './repositories/managed-wallets-data.repository';
import { ManagedWalletsController } from './managed-wallets.controller';
import { DepositMethodsController } from './deposit-methods.controller';
import { WalletEncryptionService } from '@/common/services';
import { TreasuryModule } from '@/modules/treasury/treasury.module';
import { SystemConfigModule } from '@/modules/system-config/system-config.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([AppSetting, OnchainTransaction, CurrencyNetwork]),
    TreasuryModule,
    SystemConfigModule,
  ],
  controllers: [ManagedWalletsController, DepositMethodsController],
  providers: [ManagedWalletsService, ManagedWalletsDataRepository, WalletEncryptionService],
  exports: [ManagedWalletsService],
})
export class ManagedWalletsModule {}
