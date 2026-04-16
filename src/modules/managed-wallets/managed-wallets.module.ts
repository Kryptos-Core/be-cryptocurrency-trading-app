import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WalletEncryptionService } from '@/common/services';
import { AppSetting } from '@/entities/app-setting.entity';
import { CurrencyNetwork } from '@/entities/currency-network.entity';
import { OnchainTransaction } from '@/entities/onchain-transaction.entity';
import { SystemConfigModule } from '@/modules/system-config/system-config.module';
import { TreasuryModule } from '@/modules/treasury/treasury.module';
import { GetManagedWalletsQuery } from './application/queries';
import {
  ClearDepositDefaultUseCase,
  CreateManagedWalletUseCase,
  DeactivateManagedWalletUseCase,
  SendManagedWalletTransactionUseCase,
  SetDepositDefaultUseCase,
  SetRecommendedChainUseCase,
} from './application/use-cases';
import { DepositMethodsController } from './deposit-methods.controller';
import { MANAGED_WALLETS_DATA_REPOSITORY } from './domain/ports';
import { ManagedWalletsController } from './managed-wallets.controller';
import { ManagedWalletsService } from './managed-wallets.service';
import { ManagedWalletsDataRepository } from './repositories/managed-wallets-data.repository';

@Module({
  imports: [
    TypeOrmModule.forFeature([AppSetting, OnchainTransaction, CurrencyNetwork]),
    TreasuryModule,
    SystemConfigModule,
  ],
  controllers: [ManagedWalletsController, DepositMethodsController],
  providers: [
    ManagedWalletsDataRepository,
    {
      provide: MANAGED_WALLETS_DATA_REPOSITORY,
      useExisting: ManagedWalletsDataRepository,
    },
    ManagedWalletsService,
    WalletEncryptionService,
    // Queries
    GetManagedWalletsQuery,
    // Use-cases
    CreateManagedWalletUseCase,
    SendManagedWalletTransactionUseCase,
    SetDepositDefaultUseCase,
    ClearDepositDefaultUseCase,
    SetRecommendedChainUseCase,
    DeactivateManagedWalletUseCase,
  ],
  exports: [ManagedWalletsService],
})
export class ManagedWalletsModule {}
