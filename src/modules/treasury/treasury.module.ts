import { BullModule } from '@nestjs/bull';
import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WalletEncryptionService } from '@/common/services';
import { OnchainTransaction } from '@/entities/onchain-transaction.entity';
import { TransactionWallet } from '@/entities/transaction-wallet.entity';
import { TreasuryMainWallet } from '@/entities/treasury-main-wallet.entity';
import { TreasuryOperation } from '@/entities/treasury-operation.entity';
import { AuthModule } from '@/modules/auth/auth.module';
import { PaymentConfigModule } from '@/modules/payment-config/payment-config.module';
import { SystemConfigModule } from '@/modules/system-config/system-config.module';
import { TREASURY_QUEUE } from './constants';
import { MainWalletRotationScheduler } from './main-wallet-rotation.scheduler';
import { OnchainChainPickerService } from './onchain-chain-picker.service';
import { TreasuryMainWalletRepository } from './repositories/treasury-main-wallet.repository';
import { TreasuryOnchainReadRepository } from './repositories/treasury-onchain-read.repository';
import { TreasuryOperationRepository } from './repositories/treasury-operation.repository';
import { TreasuryTransactionWalletRepository } from './repositories/treasury-transaction-wallet.repository';
import { TransactionWalletService } from './transaction-wallet.service';
import { TreasuryController } from './treasury.controller';
import { TreasuryProcessor } from './treasury.processor';
import { TreasuryMainWalletService } from './treasury-main-wallet.service';
import { TreasuryOperationsService } from './treasury-operations.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TransactionWallet,
      TreasuryMainWallet,
      TreasuryOperation,
      OnchainTransaction,
    ]),
    PaymentConfigModule,
    SystemConfigModule,
    forwardRef(() => AuthModule), // forwardRef avoids potential circular deps
    BullModule.registerQueue({
      name: TREASURY_QUEUE,
    }),
  ],
  controllers: [TreasuryController],
  providers: [
    WalletEncryptionService,
    TreasuryTransactionWalletRepository,
    TreasuryMainWalletRepository,
    TreasuryOperationRepository,
    TreasuryOnchainReadRepository,
    TransactionWalletService,
    TreasuryMainWalletService,
    TreasuryOperationsService,
    TreasuryProcessor,
    MainWalletRotationScheduler,
    OnchainChainPickerService,
  ],
  exports: [
    TransactionWalletService,
    TreasuryMainWalletService,
    TreasuryOperationsService,
    OnchainChainPickerService,
    TreasuryTransactionWalletRepository,
  ],
})
export class TreasuryModule {}
