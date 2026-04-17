import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminWalletAdjustment } from '@/entities/admin-wallet-adjustment.entity';
import { Wallet } from '@/entities/wallet.entity';
import { WalletLedger } from '@/entities/wallet-ledger.entity';
import { ExchangeModule } from '@/modules/exchange/exchange.module';
// Application — queries
import {
  GetAdminAdjustmentHistoryQuery,
  GetBalanceQuery,
  GetTransactionHistoryQuery,
  GetWalletsQuery,
} from './application/queries';
// Application — use cases
import {
  AdminAdjustBalanceUseCase,
  ApplyTransactionUseCase,
  ExportReconciliationReportUseCase,
  ReconcileBalanceUseCase,
  SyncBalanceWithExchangeUseCase,
} from './application/use-cases';
// Domain
import {
  ADMIN_ADJUSTMENT_REPOSITORY,
  CURRENCY_LOOKUP,
  EXCHANGE_SERVICE_PORT,
  WALLET_EVENT_PUBLISHER,
  WALLET_LEDGER_REPOSITORY,
  WALLET_REPOSITORY,
} from './domain/ports';
import { BalanceCalculationService } from './domain/services/balance-calculation.service';
// Infrastructure — adapters
import {
  CurrencyLookupAdapter,
  ExchangeServiceAdapter,
  RedisWalletEventPublisher,
} from './infrastructure/adapters';
// Infrastructure — persistence
import {
  AdminWalletAdjustmentRepositoryImpl,
  WalletLedgerRepositoryImpl,
  WalletRepositoryImpl,
} from './infrastructure/persistence';

// Presentation / legacy
import { WalletsController } from './wallets.controller';
import { WalletsService } from './wallets.service';

/**
 * Wallets Module — Clean Architecture wiring.
 *
 * Port bindings (DIP):
 *   WALLET_REPOSITORY          → WalletRepositoryImpl
 *   WALLET_LEDGER_REPOSITORY   → WalletLedgerRepositoryImpl
 *   ADMIN_ADJUSTMENT_REPOSITORY → AdminWalletAdjustmentRepositoryImpl
 *   WALLET_EVENT_PUBLISHER     → RedisWalletEventPublisher
 *   CURRENCY_LOOKUP            → CurrencyLookupAdapter
 *   EXCHANGE_SERVICE_PORT      → ExchangeServiceAdapter
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Wallet, WalletLedger, AdminWalletAdjustment]),
    ExchangeModule,
  ],
  providers: [
    // ─── Port → Adapter bindings ───────────────────
    { provide: WALLET_REPOSITORY, useClass: WalletRepositoryImpl },
    { provide: WALLET_LEDGER_REPOSITORY, useClass: WalletLedgerRepositoryImpl },
    { provide: ADMIN_ADJUSTMENT_REPOSITORY, useClass: AdminWalletAdjustmentRepositoryImpl },
    { provide: WALLET_EVENT_PUBLISHER, useClass: RedisWalletEventPublisher },
    { provide: CURRENCY_LOOKUP, useClass: CurrencyLookupAdapter },
    { provide: EXCHANGE_SERVICE_PORT, useClass: ExchangeServiceAdapter },

    // ─── Domain services ───────────────────────────
    BalanceCalculationService,

    // ─── Application use cases ─────────────────────
    ApplyTransactionUseCase,
    AdminAdjustBalanceUseCase,
    SyncBalanceWithExchangeUseCase,
    ReconcileBalanceUseCase,
    ExportReconciliationReportUseCase,

    // ─── Application queries ───────────────────────
    GetWalletsQuery,
    GetBalanceQuery,
    GetTransactionHistoryQuery,
    GetAdminAdjustmentHistoryQuery,

    // ─── Legacy concrete repos (for external imports) ──
    WalletRepositoryImpl,
    WalletLedgerRepositoryImpl,
    AdminWalletAdjustmentRepositoryImpl,

    // ─── Transitional facade ───────────────────────
    WalletsService,
  ],
  controllers: [WalletsController],
  exports: [
    WalletsService,
    // Ports (preferred for new consumers)
    WALLET_REPOSITORY,
    WALLET_LEDGER_REPOSITORY,
    // Legacy concrete exports (for existing external consumers)
    WalletRepositoryImpl,
    WalletLedgerRepositoryImpl,
  ],
})
export class WalletsModule {}
