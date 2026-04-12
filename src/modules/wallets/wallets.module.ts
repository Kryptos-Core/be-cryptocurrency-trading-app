import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminWalletAdjustment } from '@/entities/admin-wallet-adjustment.entity';
import { Wallet } from '@/entities/wallet.entity';
import { WalletLedger } from '@/entities/wallet-ledger.entity';
import { ExchangeModule } from '@/modules/exchange/exchange.module';
import { AdminWalletAdjustmentRepository } from './repositories/admin-wallet-adjustment.repository';
import { WalletRepository } from './repositories/wallet.repository';
import { WalletLedgerRepository } from './repositories/wallet-ledger.repository';
import { WalletsController } from './wallets.controller';
import { WalletsService } from './wallets.service';

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
