import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WalletsService } from './wallets.service';
import { WalletsController } from './wallets.controller';
import { WalletRepository } from './repositories/wallet.repository';
import { WalletLedgerRepository } from './repositories/wallet-ledger.repository';
import { Wallet } from '@/entities/wallet.entity';
import { WalletLedger } from '@/entities/wallet-ledger.entity';
import { ExchangeModule } from '@/modules/exchange/exchange.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Wallet, WalletLedger]),
    ExchangeModule,
  ],
  providers: [WalletsService, WalletRepository, WalletLedgerRepository],
  controllers: [WalletsController],
  exports: [WalletsService, WalletRepository, WalletLedgerRepository],
})
export class WalletsModule {}
