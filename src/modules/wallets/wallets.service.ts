import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import Decimal from 'decimal.js';
import { promises as fs } from 'fs';
import * as path from 'path';
import { WalletRepository } from './repositories/wallet.repository';
import { WalletLedgerRepository } from './repositories/wallet-ledger.repository';
import { AdminWalletAdjustmentRepository } from './repositories/admin-wallet-adjustment.repository';
import {
  BadRequestException,
  BusinessException,
  ConflictException,
} from '@/common/exceptions';
import { WalletBalanceDto } from './dto/wallet-balance.dto';
import { WalletListItemDto } from './dto/wallet-list-item.dto';
import { WalletLedgerEntryDto } from './dto/wallet-ledger-entry.dto';
import { WalletTransactionDto } from './dto/wallet-transaction.dto';
import { AdminAdjustWalletDto, AdminAdjustWalletResponseDto } from './dto/admin-adjust-wallet.dto';
import { WalletTransactionAction, WalletReferenceType } from '@/common/enums';
import { ExchangeService } from '@/modules/exchange/exchange.service';
import { RedisService } from '@/common/services/redis.service';
import { newUuid } from '@/common/utils/uuid.util';
import { WALLET_BALANCE_EVENTS_CHANNEL, WalletBalanceEvent } from './constants';

/**
 * Wallets Service - Business Logic Layer
 * Service Layer Pattern: Centralized wallet business logic
 * Unit of Work Pattern: Transaction scope via repository.transaction
 * Double Entry Accounting: Ledger entries for each operation
 */
@Injectable()
export class WalletsService {
  private readonly logger = new Logger(WalletsService.name);

  constructor(
    private readonly walletRepository: WalletRepository,
    private readonly walletLedgerRepository: WalletLedgerRepository,
    private readonly adminAdjustmentRepository: AdminWalletAdjustmentRepository,
    private readonly exchangeService: ExchangeService,
    private readonly redisService: RedisService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Get transaction history (ledger entries) for a user and currency.
   * Deduplicates by (refType, refId): for DEPOSIT keeps only CREDIT, for WITHDRAW only DEBIT,
   * so old double-entry rows created before the fix show as one record each.
   */
  async getTransactionHistory(
    userId: string,
    currencyId: string,
    limit: number = 100,
  ): Promise<WalletLedgerEntryDto[]> {
    const entries = await this.walletLedgerRepository.findRecentByUserAndCurrency(
      userId,
      currencyId,
      limit,
    );
    const canonicalDirection: Record<string, string> = {
      DEPOSIT: 'CREDIT',
      WITHDRAW: 'DEBIT',
      EXTERNAL_DEPOSIT: 'CREDIT',
      EXTERNAL_WITHDRAWAL: 'DEBIT',
    };
    const seen = new Set<string>();
    const result: WalletLedgerEntryDto[] = [];
    for (const e of entries) {
      const key = `${e.ref_type}:${e.ref_id}`;
      const wantDir = canonicalDirection[e.ref_type] ?? e.direction;
      if (seen.has(key)) continue;
      if (e.direction !== wantDir) continue;
      seen.add(key);
      result.push({
        refType: e.ref_type,
        refId: e.ref_id,
        direction: e.direction,
        amount: String(e.amount),
        createdAt: e.created_at instanceof Date ? e.created_at.toISOString() : String(e.created_at),
      });
    }
    return result;
  }

  /**
   * Get all wallets for the current user (optionally exclude zero balances).
   */
  async getWallets(
    userId: string,
    includeZero: boolean = true,
  ): Promise<WalletListItemDto[]> {
    const rows = await this.walletRepository.findByUser(userId, includeZero);
    return rows.map((w) => {
      const available = String(w.available ?? '0');
      const frozen = String(w.frozen ?? '0');
      const total = new Decimal(available).plus(frozen).toString();
      return {
        walletId: w.wallet_id,
        currencyId: w.currency_id,
        symbol: (w as any).currency_symbol ?? '',
        name: (w as any).currency_name ?? '',
        available,
        frozen,
        total,
      };
    });
  }

  /**
   * Get wallet balance for a user and currency
   */
  async getBalance(userId: string, currencyId: string): Promise<WalletBalanceDto> {
    const wallet = await this.walletRepository.findByUserCurrency(userId, currencyId);

    if (!wallet) {
      return this.buildBalanceDto(userId, currencyId, '0', '0');
    }

    return this.buildBalanceDto(
      userId,
      currencyId,
      wallet.available ?? '0',
      wallet.frozen ?? '0',
    );
  }

  /**
   * Apply wallet transaction (credit, debit, freeze, unfreeze, transfer)
   */
  async applyTransaction(
    userId: string,
    dto: WalletTransactionDto,
  ): Promise<WalletBalanceDto> {
    const amount = this.parseAmount(dto.amount);
    const currencyId = String(dto.currencyId);

    try {
      const result = await this.walletRepository.transaction(async (manager) => {
        switch (dto.action) {
          case WalletTransactionAction.CREDIT:
            return this.credit(userId, dto, amount, manager);
          case WalletTransactionAction.DEBIT:
            return this.debit(userId, dto, amount, manager);
          case WalletTransactionAction.FREEZE:
            return this.freeze(userId, dto, amount, manager);
          case WalletTransactionAction.UNFREEZE:
            return this.unfreeze(userId, dto, amount, manager);
          case WalletTransactionAction.TRANSFER:
            return this.transfer(userId, dto, amount, manager);
          default:
            throw new BadRequestException('Invalid wallet action', 'INVALID_ACTION');
        }
      });

      const symbol = await this.getCurrencySymbol(currencyId);
      await this.publishBalanceChange(userId, currencyId, symbol, result.available, result.frozen);

      if (dto.action === WalletTransactionAction.TRANSFER && dto.targetUserId) {
        const targetBalance = await this.getBalance(String(dto.targetUserId), currencyId);
        await this.publishBalanceChange(
          String(dto.targetUserId),
          currencyId,
          symbol,
          targetBalance.available,
          targetBalance.frozen,
        );
      }

      return result;
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      if (typeof msg === 'string' && msg.includes('Duplicate entry') && msg.includes('uk_ledger_ref')) {
        throw new ConflictException(
          'Duplicate transaction reference. Please try again.',
          'DUPLICATE_LEDGER_ENTRY',
        );
      }
      throw err;
    }
  }

  private async credit(
    userId: string,
    dto: WalletTransactionDto,
    amount: Decimal,
    manager: any,
  ): Promise<WalletBalanceDto> {
    const currencyId = String(dto.currencyId);
    const wallet = await this.walletRepository.getOrCreateForUpdate(
      userId,
      currencyId,
      manager,
    );

    const updated = await this.applyDelta(
      wallet.wallet_id,
      amount,
      new Decimal(0),
      manager,
    );

    await this.walletLedgerRepository.createEntry(
      {
        userId,
        currencyId,
        refType: dto.refType,
        refId: dto.refId,
        direction: 'CREDIT',
        amount: amount.toString(),
        balanceAfter: this.calculateTotal(updated.available, updated.frozen),
      },
      manager,
    );

    return this.buildBalanceDto(userId, currencyId, updated.available, updated.frozen);
  }

  private async debit(
    userId: string,
    dto: WalletTransactionDto,
    amount: Decimal,
    manager: any,
  ): Promise<WalletBalanceDto> {
    const currencyId = String(dto.currencyId);
    const wallet = await this.walletRepository.getOrCreateForUpdate(
      userId,
      currencyId,
      manager,
    );

    const updated = await this.applyDelta(
      wallet.wallet_id,
      amount.negated(),
      new Decimal(0),
      manager,
    );

    await this.walletLedgerRepository.createEntry(
      {
        userId,
        currencyId,
        refType: dto.refType,
        refId: dto.refId,
        direction: 'DEBIT',
        amount: amount.toString(),
        balanceAfter: this.calculateTotal(updated.available, updated.frozen),
      },
      manager,
    );

    return this.buildBalanceDto(userId, currencyId, updated.available, updated.frozen);
  }

  private async freeze(
    userId: string,
    dto: WalletTransactionDto,
    amount: Decimal,
    manager: any,
  ): Promise<WalletBalanceDto> {
    const currencyId = String(dto.currencyId);
    const wallet = await this.walletRepository.getOrCreateForUpdate(
      userId,
      currencyId,
      manager,
    );

    const updated = await this.applyDelta(
      wallet.wallet_id,
      amount.negated(),
      amount,
      manager,
    );

    await this.walletLedgerRepository.createDoubleEntry(
      {
        userId,
        currencyId,
        refType: dto.refType,
        refId: dto.refId,
        amount: amount.toString(),
        balanceAfter: this.calculateTotal(updated.available, updated.frozen),
      },
      manager,
    );

    return this.buildBalanceDto(userId, currencyId, updated.available, updated.frozen);
  }

  private async unfreeze(
    userId: string,
    dto: WalletTransactionDto,
    amount: Decimal,
    manager: any,
  ): Promise<WalletBalanceDto> {
    const currencyId = String(dto.currencyId);
    const wallet = await this.walletRepository.getOrCreateForUpdate(
      userId,
      currencyId,
      manager,
    );

    const updated = await this.applyDelta(
      wallet.wallet_id,
      amount,
      amount.negated(),
      manager,
    );

    await this.walletLedgerRepository.createDoubleEntry(
      {
        userId,
        currencyId,
        refType: dto.refType,
        refId: dto.refId,
        amount: amount.toString(),
        balanceAfter: this.calculateTotal(updated.available, updated.frozen),
      },
      manager,
    );

    return this.buildBalanceDto(userId, currencyId, updated.available, updated.frozen);
  }

  private async transfer(
    userId: string,
    dto: WalletTransactionDto,
    amount: Decimal,
    manager: any,
  ): Promise<WalletBalanceDto> {
    const targetId = String(dto.targetUserId ?? '');
    if (!targetId) {
      throw new BadRequestException('targetUserId is required for TRANSFER', 'TARGET_REQUIRED');
    }

    if (targetId === userId) {
      throw new BadRequestException('Cannot transfer to the same user', 'INVALID_TARGET');
    }

    const [firstUserId, secondUserId] =
      userId.localeCompare(targetId) < 0 ? [userId, targetId] : [targetId, userId];

    const currencyId = String(dto.currencyId);
    const firstWallet = await this.walletRepository.getOrCreateForUpdate(
      firstUserId,
      currencyId,
      manager,
    );
    const secondWallet = await this.walletRepository.getOrCreateForUpdate(
      secondUserId,
      currencyId,
      manager,
    );

    const sourceWallet = userId === firstUserId ? firstWallet : secondWallet;
    const targetWallet = userId === firstUserId ? secondWallet : firstWallet;

    const sourceUpdated = await this.applyDelta(
      sourceWallet.wallet_id,
      amount.negated(),
      new Decimal(0),
      manager,
    );

    const targetUpdated = await this.applyDelta(
      targetWallet.wallet_id,
      amount,
      new Decimal(0),
      manager,
    );

    await this.walletLedgerRepository.createDoubleEntry(
      {
        userId,
        currencyId,
        refType: dto.refType,
        refId: dto.refId,
        amount: amount.toString(),
        balanceAfter: this.calculateTotal(
          sourceUpdated.available,
          sourceUpdated.frozen,
        ),
      },
      manager,
    );

    await this.walletLedgerRepository.createDoubleEntry(
      {
        userId: targetId,
        currencyId,
        refType: dto.refType,
        refId: dto.refId,
        amount: amount.toString(),
        balanceAfter: this.calculateTotal(
          targetUpdated.available,
          targetUpdated.frozen,
        ),
      },
      manager,
    );

    return this.buildBalanceDto(
      userId,
      currencyId,
      sourceUpdated.available,
      sourceUpdated.frozen,
    );
  }

  private async applyDelta(
    walletId: string,
    deltaAvailable: Decimal,
    deltaFrozen: Decimal,
    manager: any,
  ) {
    try {
      return await this.walletRepository.applyBalanceDelta(
        walletId,
        deltaAvailable.toString(),
        deltaFrozen.toString(),
        manager,
      );
    } catch (error: any) {
      if (error?.message?.includes('Insufficient')) {
        throw new BusinessException('Insufficient balance', 'INSUFFICIENT_BALANCE');
      }
      throw error;
    }
  }

  private parseAmount(amount: string): Decimal {
    try {
      const value = new Decimal(amount);
      if (value.lte(0)) {
        throw new BadRequestException('Amount must be greater than 0', 'INVALID_AMOUNT');
      }
      return value;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Invalid amount', 'INVALID_AMOUNT');
    }
  }

  private calculateTotal(available: string, frozen: string): string {
    const total = new Decimal(available || '0').plus(new Decimal(frozen || '0'));
    return total.toString();
  }

  private buildBalanceDto(
    userId: string,
    currencyId: string,
    available: string,
    frozen: string,
  ): WalletBalanceDto {
    const safeAvailable = available ?? '0';
    const safeFrozen = frozen ?? '0';
    const total = this.calculateTotal(safeAvailable, safeFrozen);
    return {
      userId,
      currencyId,
      available: safeAvailable.toString(),
      frozen: safeFrozen.toString(),
      total,
    };
  }

  /**
   * Publish wallet balance change event to Redis Pub/Sub.
   * NotificationsGateway subscribes and pushes to the user's Socket.IO room.
   */
  private async publishBalanceChange(
    userId: string,
    currencyId: string,
    symbol: string,
    available: string,
    frozen: string,
  ): Promise<void> {
    const event: WalletBalanceEvent = {
      userId,
      currencyId,
      symbol,
      available,
      frozen,
      total: this.calculateTotal(available, frozen),
      updatedAt: Date.now(),
    };
    try {
      await this.redisService.publish(WALLET_BALANCE_EVENTS_CHANNEL, JSON.stringify(event));
      this.logger.debug(`Published balance change: user=${userId}, currency=${symbol}`);
    } catch (error) {
      this.logger.error(`Failed to publish balance change event: ${error}`);
    }
  }

  /**
   * Get currency symbol by currencyId.
   */
  private async getCurrencySymbol(currencyId: string): Promise<string> {
    try {
      const rows = await this.dataSource.query(
        'SELECT symbol FROM currencies WHERE currency_id = ? LIMIT 1',
        [currencyId],
      );
      return rows?.[0]?.symbol ?? '';
    } catch (error) {
      this.logger.error(`Failed to get currency symbol for ${currencyId}: ${error}`);
      return '';
    }
  }

  /**
   * Sync wallet balance with Binance exchange
   * Fetches actual balance from Binance and updates internal wallet
   */
  async syncBalanceWithExchange(
    userId: string,
    currencyId: string,
  ): Promise<WalletBalanceDto> {
    // Get currency symbol from database
    const wallet = await this.walletRepository.findByUserCurrency(userId, currencyId);
    if (!wallet) {
      throw new BadRequestException(
        `Wallet not found for user ${userId} and currency ${currencyId}`,
      );
    }

    // Fetch balance from Binance - use default asset for testnet (USDT)
    try {
      const exchangeBalance = await this.exchangeService.getBalance('USDT');
      this.logger.debug(`[Binance] Got balance: ${JSON.stringify(exchangeBalance)}`);

      // Convert Decimal to string
      const available = exchangeBalance.available
        ? exchangeBalance.available.toString()
        : '0';
      const frozen = exchangeBalance.frozen
        ? exchangeBalance.frozen.toString()
        : '0';

      // Return synced balance
      return this.buildBalanceDto(userId, currencyId, available, frozen);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`[Binance] Balance sync failed: ${errorMessage}`);
      throw new BusinessException(
        'Failed to sync balance with exchange: ' + errorMessage,
      );
    }
  }

  /**
   * Reconcile wallet balance between internal and exchange
   * Detects and fixes discrepancies
   * Note: Reconciliation entries are only created once per user/currency to avoid unique constraint violations
   */
  async reconcileBalance(
    userId: string,
    currencyId: string,
    manager?: any,
  ): Promise<{ internalBalance: string; externalBalance: string; discrepancy: string; status: string }> {
    const wallet = await this.walletRepository.findByUserCurrency(userId, currencyId);
    if (!wallet) {
      throw new BadRequestException(
        `Wallet not found for user ${userId} and currency ${currencyId}`,
      );
    }

    // Get internal balance
    const internalBalance = wallet.available ?? '0';

    // Get external balance from Binance
    let externalBalance = '0';
    try {
      const exchangeBalance = await this.exchangeService.getBalance('USDT');
      externalBalance = exchangeBalance.available
        ? exchangeBalance.available.toString()
        : '0';
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new BusinessException(
        'Failed to get balance from exchange: ' + errorMessage,
      );
    }

    // Calculate discrepancy
    const internal = new Decimal(internalBalance);
    const external = new Decimal(externalBalance);
    const discrepancy = external.minus(internal);

    // Try to create reconciliation entry, but handle duplicate key gracefully
    // since reconciliation might be called multiple times
    try {
      await this.walletLedgerRepository.createEntry(
        {
          userId,
          currencyId,
          refType: WalletReferenceType.RECONCILIATION,
          refId: 0,
          direction: discrepancy.isPositive() ? 'CREDIT' : 'DEBIT',
          amount: discrepancy.abs().toString(),
          balanceAfter: externalBalance,
        },
        manager,
      );
    } catch (error: any) {
      // Ignore duplicate key constraint errors - reconciliation already recorded
      const errorMessage = error?.message || String(error);
      if (!errorMessage.includes('Duplicate entry')) {
        this.logger.error(`[Reconciliation] Unexpected error: ${errorMessage}`);
        throw error;
      }
      this.logger.debug(
        `[Reconciliation] Entry already exists for user ${userId}, currency ${currencyId}`,
      );
    }

    this.logger.log(
      `[Reconciliation] User ${userId}, Currency ${currencyId}: Internal=${internalBalance}, External=${externalBalance}, Diff=${discrepancy}`,
    );

    return {
      internalBalance,
      externalBalance,
      discrepancy: discrepancy.toString(),
      status: discrepancy.isZero() ? 'BALANCED' : 'DISCREPANCY_DETECTED',
    };
  }

  /**
   * Export reconciliation report to a daily JSON history file.
   */
  async exportDailyReconciliationReport(
    actorUserId: string,
    limit: number = 100,
  ): Promise<{
    reportDate: string;
    reportAt: string;
    outputFile: string;
    summary: {
      actorUserId: string;
      checked: number;
      balanced: number;
      discrepancyDetected: number;
      failed: number;
    };
  }> {
    const reportAt = new Date();
    const reportDate = reportAt.toISOString().slice(0, 10);
    const safeLimit = Math.min(Math.max(limit, 1), 1000);

    const pairs = await this.walletRepository.findWalletPairs(safeLimit);
    const items: Array<{
      userId: string;
      currencyId: string;
      status: string;
      internalBalance?: string;
      externalBalance?: string;
      discrepancy?: string;
      error?: string;
    }> = [];

    for (const pair of pairs) {
      try {
        const result = await this.reconcileBalance(pair.userId, pair.currencyId);
        items.push({
          userId: pair.userId,
          currencyId: pair.currencyId,
          status: result.status,
          internalBalance: result.internalBalance,
          externalBalance: result.externalBalance,
          discrepancy: result.discrepancy,
        });
      } catch (error: any) {
        items.push({
          userId: pair.userId,
          currencyId: pair.currencyId,
          status: 'FAILED',
          error: error?.message || String(error),
        });
      }
    }

    const balanced = items.filter((item) => item.status === 'BALANCED').length;
    const discrepancyDetected = items.filter(
      (item) => item.status === 'DISCREPANCY_DETECTED',
    ).length;
    const failed = items.filter((item) => item.status === 'FAILED').length;

    const entry = {
      reportAt: reportAt.toISOString(),
      actorUserId,
      limit: safeLimit,
      summary: {
        checked: items.length,
        balanced,
        discrepancyDetected,
        failed,
      },
      items,
    };

    const outputDir = path.join(process.cwd(), 'reports', 'reconciliation');
    const outputFile = path.join(outputDir, `${reportDate}.json`);
    await fs.mkdir(outputDir, { recursive: true });

    let history: any[] = [];
    try {
      const existing = await fs.readFile(outputFile, 'utf8');
      const parsed = JSON.parse(existing);
      if (Array.isArray(parsed)) {
        history = parsed;
      }
    } catch {
      history = [];
    }

    history.push(entry);
    await fs.writeFile(outputFile, JSON.stringify(history, null, 2), 'utf8');

    this.logger.log(
      `[ReconciliationExport] actor=${actorUserId}, checked=${items.length}, discrepancies=${discrepancyDetected}, failed=${failed}, file=${outputFile}`,
    );

    return {
      reportDate,
      reportAt: entry.reportAt,
      outputFile,
      summary: {
        actorUserId,
        checked: items.length,
        balanced,
        discrepancyDetected,
        failed,
      },
    };
  }

  /**
   * Điều chỉnh số dư ví thủ công bởi admin/risk officer.
   * Tạo bản ghi audit trong admin_wallet_adjustments, sau đó CREDIT hoặc DEBIT
   * ví của người dùng với refType=ADJUST và refId=adjustmentId.
   * Toàn bộ hoạt động được bọc trong một DB transaction để đảm bảo atomicity.
   */
  async adminAdjustBalance(
    actorUserId: string,
    dto: AdminAdjustWalletDto,
  ): Promise<AdminAdjustWalletResponseDto> {
    const adjustmentId = newUuid();
    const amount = this.parseAmount(dto.amount);
    let updatedBalance: { available: string; frozen: string } | null = null;

    try {
      const result = await this.walletRepository.transaction(async (manager) => {
        const adjustment = await this.adminAdjustmentRepository.createAdjustment(
          {
            adjustmentId,
            actorUserId,
            targetUserId: dto.userId,
            currencyId: dto.currencyId,
            amount: amount.toString(),
            type: dto.type,
            note: dto.note,
          },
          manager,
        );

        const action =
          dto.type === 'DEPOSIT'
            ? WalletTransactionAction.CREDIT
            : WalletTransactionAction.DEBIT;

        const wallet = await this.walletRepository.getOrCreateForUpdate(
          dto.userId,
          dto.currencyId,
          manager,
        );

        const updated = await this.applyDelta(
          wallet.wallet_id,
          action === WalletTransactionAction.CREDIT ? amount : amount.negated(),
          new Decimal(0),
          manager,
        );

        updatedBalance = { available: updated.available, frozen: updated.frozen };

        await this.walletLedgerRepository.createEntry(
          {
            userId: dto.userId,
            currencyId: dto.currencyId,
            refType: WalletReferenceType.ADJUST,
            refId: adjustmentId,
            direction: action === WalletTransactionAction.CREDIT ? 'CREDIT' : 'DEBIT',
            amount: amount.toString(),
            balanceAfter: this.calculateTotal(updated.available, updated.frozen),
          },
          manager,
        );

        this.logger.log(
          `[AdminAdjust] actor=${actorUserId} type=${dto.type} amount=${dto.amount} target=${dto.userId} currency=${dto.currencyId} adjustmentId=${adjustmentId}`,
        );

        return adjustment;
      });

      // updatedBalance is assigned inside the transaction closure; TypeScript's
      // control-flow analysis narrows it to never after the closure, so we cast explicitly.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const balanceSnapshot = updatedBalance as any as ({ available: string; frozen: string } | null);
      if (balanceSnapshot !== null) {
        const symbol = await this.getCurrencySymbol(dto.currencyId);
        await this.publishBalanceChange(
          dto.userId,
          dto.currencyId,
          symbol,
          balanceSnapshot.available,
          balanceSnapshot.frozen,
        );
      }

      return result;
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      if (typeof msg === 'string' && msg.includes('Duplicate entry') && msg.includes('uk_ledger_ref')) {
        throw new ConflictException(
          'Duplicate transaction reference. Please try again.',
          'DUPLICATE_LEDGER_ENTRY',
        );
      }
      throw err;
    }
  }

  /**
   * Lấy lịch sử điều chỉnh số dư thủ công cho một người dùng (phân trang).
   */
  async getAdminAdjustmentHistory(
    targetUserId: string,
    limit: number = 50,
    offset: number = 0,
  ): Promise<AdminAdjustWalletResponseDto[]> {
    return this.adminAdjustmentRepository.findByTarget(targetUserId, limit, offset);
  }

}
