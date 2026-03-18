import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WalletsService } from './wallets.service';
import { WalletsController } from './wallets.controller';
import { WalletRepository } from './repositories/wallet.repository';
import { WalletLedgerRepository } from './repositories/wallet-ledger.repository';
import { AdminWalletAdjustmentRepository } from './repositories/admin-wallet-adjustment.repository';
import { Wallet } from '@/entities/wallet.entity';
import { WalletLedger } from '@/entities/wallet-ledger.entity';
import { AdminWalletAdjustment } from '@/entities/admin-wallet-adjustment.entity';
import { ExchangeModule } from '@/modules/exchange/exchange.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Wallet, WalletLedger, AdminWalletAdjustment]),
    ExchangeModule,
  ],
  providers: [
    WalletsService,
    WalletRepository,
    WalletLedgerRepository,
    AdminWalletAdjustmentRepository,
  ],
  controllers: [WalletsController],
  exports: [WalletsService, WalletRepository, WalletLedgerRepository],
})
export class WalletsModule {}
