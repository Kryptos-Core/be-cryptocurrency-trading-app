import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { OnchainTransaction } from '@/entities/onchain-transaction.entity';
import { TransactionWallet } from '@/entities/transaction-wallet.entity';
import { TreasuryMainWallet } from '@/entities/treasury-main-wallet.entity';
import { TreasuryOperation } from '@/entities/treasury-operation.entity';
import { WalletEncryptionService } from '@/common/services';
import { PaymentConfigModule } from '@/modules/payment-config/payment-config.module';
import { TREASURY_QUEUE } from './constants';
import { TreasuryController } from './treasury.controller';
import { TransactionWalletService } from './transaction-wallet.service';
import { TreasuryOperationsService } from './treasury-operations.service';
import { TreasuryMainWalletService } from './treasury-main-wallet.service';
import { TreasuryProcessor } from './treasury.processor';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TransactionWallet,
      TreasuryMainWallet,
      TreasuryOperation,
      OnchainTransaction,
    ]),
    PaymentConfigModule,
    BullModule.registerQueue({
      name: TREASURY_QUEUE,
    }),
  ],
  controllers: [TreasuryController],
  providers: [
    WalletEncryptionService,
    TransactionWalletService,
    TreasuryMainWalletService,
    TreasuryOperationsService,
    TreasuryProcessor,
  ],
  exports: [TransactionWalletService, TreasuryMainWalletService, TreasuryOperationsService],
})
export class TreasuryModule {}
