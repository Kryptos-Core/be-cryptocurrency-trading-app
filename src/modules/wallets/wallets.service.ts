import { Injectable } from '@nestjs/common';
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
import type {
  AdminAdjustWalletDto,
  AdminAdjustWalletResponseDto,
} from './dto/admin-adjust-wallet.dto';
import type { WalletBalanceDto } from './dto/wallet-balance.dto';
import type { WalletLedgerEntryDto } from './dto/wallet-ledger-entry.dto';
import type { WalletListItemDto } from './dto/wallet-list-item.dto';
import type { WalletTransactionDto } from './dto/wallet-transaction.dto';

/**
 * Transitional facade that keeps the current controller contract while
 * all wallet behavior lives in application use cases / queries.
 *
 * External modules (orders, deposits, blockchain, …) still inject WalletsService.
 * Internally, every method delegates to the appropriate use case or query.
 */
@Injectable()
export class WalletsService {
  constructor(
    private readonly applyTransactionUseCase: ApplyTransactionUseCase,
    private readonly adminAdjustBalanceUseCase: AdminAdjustBalanceUseCase,
    private readonly syncBalanceUseCase: SyncBalanceWithExchangeUseCase,
    private readonly reconcileBalanceUseCase: ReconcileBalanceUseCase,
    private readonly exportReportUseCase: ExportReconciliationReportUseCase,
    private readonly getWalletsQuery: GetWalletsQuery,
    private readonly getBalanceQuery: GetBalanceQuery,
    private readonly getTransactionHistoryQuery: GetTransactionHistoryQuery,
    private readonly getAdminAdjustmentHistoryQuery: GetAdminAdjustmentHistoryQuery,
  ) {}

  // ─── Queries ─────────────────────────────────────────────

  getTransactionHistory(
    userId: string,
    currencyId: string,
    limit: number = 100,
  ): Promise<WalletLedgerEntryDto[]> {
    return this.getTransactionHistoryQuery.execute(userId, currencyId, limit);
  }

  getWallets(userId: string, includeZero: boolean = true): Promise<WalletListItemDto[]> {
    return this.getWalletsQuery.execute(userId, includeZero);
  }

  getBalance(userId: string, currencyId: string): Promise<WalletBalanceDto> {
    return this.getBalanceQuery.execute(userId, currencyId);
  }

  getAdminAdjustmentHistory(
    targetUserId: string,
    limit: number = 50,
    offset: number = 0,
  ): Promise<AdminAdjustWalletResponseDto[]> {
    return this.getAdminAdjustmentHistoryQuery.execute(targetUserId, limit, offset);
  }

  // ─── Commands / Use Cases ────────────────────────────────

  applyTransaction(userId: string, dto: WalletTransactionDto): Promise<WalletBalanceDto> {
    return this.applyTransactionUseCase.execute(userId, dto);
  }

  adminAdjustBalance(
    actorUserId: string,
    dto: AdminAdjustWalletDto,
  ): Promise<AdminAdjustWalletResponseDto> {
    return this.adminAdjustBalanceUseCase.execute(actorUserId, dto);
  }

  syncBalanceWithExchange(userId: string, currencyId: string): Promise<WalletBalanceDto> {
    return this.syncBalanceUseCase.execute(userId, currencyId);
  }

  reconcileBalance(
    userId: string,
    currencyId: string,
    manager?: any,
  ): Promise<{
    internalBalance: string;
    externalBalance: string;
    discrepancy: string;
    status: string;
  }> {
    return this.reconcileBalanceUseCase.execute(userId, currencyId, manager);
  }

  exportDailyReconciliationReport(actorUserId: string, limit: number = 100) {
    return this.exportReportUseCase.execute(actorUserId, limit);
  }
}
