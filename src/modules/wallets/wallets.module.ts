import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OutboxModule } from '@/common/outbox/outbox.module';
import { AdminWalletAdjustment } from '@/entities/admin-wallet-adjustment.entity';
import { Wallet } from '@/entities/wallet.entity';
import { WalletLedger } from '@/entities/wallet-ledger.entity';
import { CurrenciesModule } from '@/modules/currencies/currencies.module';
import { ExchangeModule } from '@/modules/exchange/exchange.module';
import {
  GetAdminAdjustmentHistoryQuery,
  GetBalanceQuery,
  GetTransactionHistoryQuery,
  GetWalletsQuery,
} from './application/queries';
import {
  AdminAdjustBalanceUseCase,
  ApplyTransactionUseCase,
  ExportReconciliationReportUseCase,
  ReconcileBalanceUseCase,
  SyncBalanceWithExchangeUseCase,
} from './application/use-cases';
import {
  ADMIN_ADJUSTMENT_REPOSITORY,
  CURRENCY_LOOKUP,
  EXCHANGE_SERVICE_PORT,
  WALLET_EVENT_PUBLISHER,
  WALLET_LEDGER_REPOSITORY,
  WALLET_REPOSITORY,
} from './domain/ports';
import { BalanceCalculationService } from './domain/services/balance-calculation.service';
import {
  CurrencyLookupAdapter,
  ExchangeServiceAdapter,
  RedisWalletEventPublisher,
} from './infrastructure/adapters';
import {
  AdminWalletAdjustmentRepositoryImpl,
  WalletLedgerRepositoryImpl,
  WalletRepositoryImpl,
} from './infrastructure/persistence';
import { WalletsController } from './wallets.controller';
import { WalletsService } from './wallets.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Wallet, WalletLedger, AdminWalletAdjustment]),
    OutboxModule,
    CurrenciesModule,
    ExchangeModule,
  ],
  providers: [
    { provide: WALLET_REPOSITORY, useClass: WalletRepositoryImpl },
    { provide: WALLET_LEDGER_REPOSITORY, useClass: WalletLedgerRepositoryImpl },
    { provide: ADMIN_ADJUSTMENT_REPOSITORY, useClass: AdminWalletAdjustmentRepositoryImpl },
    { provide: WALLET_EVENT_PUBLISHER, useClass: RedisWalletEventPublisher },
    { provide: CURRENCY_LOOKUP, useClass: CurrencyLookupAdapter },
    { provide: EXCHANGE_SERVICE_PORT, useClass: ExchangeServiceAdapter },
    BalanceCalculationService,
    ApplyTransactionUseCase,
    AdminAdjustBalanceUseCase,
    SyncBalanceWithExchangeUseCase,
    ReconcileBalanceUseCase,
    ExportReconciliationReportUseCase,
    GetWalletsQuery,
    GetBalanceQuery,
    GetTransactionHistoryQuery,
    GetAdminAdjustmentHistoryQuery,
    WalletRepositoryImpl,
    WalletLedgerRepositoryImpl,
    AdminWalletAdjustmentRepositoryImpl,
    WalletsService,
  ],
  controllers: [WalletsController],
  exports: [
    WalletsService,
    WALLET_REPOSITORY,
    WALLET_LEDGER_REPOSITORY,
    WalletRepositoryImpl,
    WalletLedgerRepositoryImpl,
  ],
})
export class WalletsModule {}
