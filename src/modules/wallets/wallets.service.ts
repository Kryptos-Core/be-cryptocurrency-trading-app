import { Injectable, Logger } from '@nestjs/common';
import Decimal from 'decimal.js';
import { WalletRepository } from './repositories/wallet.repository';
import { WalletLedgerRepository } from './repositories/wallet-ledger.repository';
import {
  BadRequestException,
  BusinessException,
} from '@/common/exceptions';
import { WalletBalanceDto } from './dto/wallet-balance.dto';
import { WalletTransactionDto } from './dto/wallet-transaction.dto';
import { WalletTransactionAction, WalletReferenceType } from '@/common/enums';
import { ExchangeService } from '@/modules/exchange/exchange.service';

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
    private readonly exchangeService: ExchangeService,
  ) {}

  /**
   * Get wallet balance for a user and currency
   */
  async getBalance(userId: number, currencyId: number): Promise<WalletBalanceDto> {
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
    userId: number,
    dto: WalletTransactionDto,
  ): Promise<WalletBalanceDto> {
    const amount = this.parseAmount(dto.amount);

    return this.walletRepository.transaction(async (manager) => {
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
  }

  private async credit(
    userId: number,
    dto: WalletTransactionDto,
    amount: Decimal,
    manager: any,
  ): Promise<WalletBalanceDto> {
    const wallet = await this.walletRepository.getOrCreateForUpdate(
      userId,
      dto.currencyId,
      manager,
    );

    const updated = await this.applyDelta(
      wallet.wallet_id,
      amount,
      new Decimal(0),
      manager,
    );

    await this.walletLedgerRepository.createDoubleEntry(
      {
        userId,
        currencyId: dto.currencyId,
        refType: dto.refType,
        refId: dto.refId,
        amount: amount.toString(),
        balanceAfter: this.calculateTotal(updated.available, updated.frozen),
      },
      manager,
    );

    return this.buildBalanceDto(userId, dto.currencyId, updated.available, updated.frozen);
  }

  private async debit(
    userId: number,
    dto: WalletTransactionDto,
    amount: Decimal,
    manager: any,
  ): Promise<WalletBalanceDto> {
    const wallet = await this.walletRepository.getOrCreateForUpdate(
      userId,
      dto.currencyId,
      manager,
    );

    const updated = await this.applyDelta(
      wallet.wallet_id,
      amount.negated(),
      new Decimal(0),
      manager,
    );

    await this.walletLedgerRepository.createDoubleEntry(
      {
        userId,
        currencyId: dto.currencyId,
        refType: dto.refType,
        refId: dto.refId,
        amount: amount.toString(),
        balanceAfter: this.calculateTotal(updated.available, updated.frozen),
      },
      manager,
    );

    return this.buildBalanceDto(userId, dto.currencyId, updated.available, updated.frozen);
  }

  private async freeze(
    userId: number,
    dto: WalletTransactionDto,
    amount: Decimal,
    manager: any,
  ): Promise<WalletBalanceDto> {
    const wallet = await this.walletRepository.getOrCreateForUpdate(
      userId,
      dto.currencyId,
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
        currencyId: dto.currencyId,
        refType: dto.refType,
        refId: dto.refId,
        amount: amount.toString(),
        balanceAfter: this.calculateTotal(updated.available, updated.frozen),
      },
      manager,
    );

    return this.buildBalanceDto(userId, dto.currencyId, updated.available, updated.frozen);
  }

  private async unfreeze(
    userId: number,
    dto: WalletTransactionDto,
    amount: Decimal,
    manager: any,
  ): Promise<WalletBalanceDto> {
    const wallet = await this.walletRepository.getOrCreateForUpdate(
      userId,
      dto.currencyId,
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
        currencyId: dto.currencyId,
        refType: dto.refType,
        refId: dto.refId,
        amount: amount.toString(),
        balanceAfter: this.calculateTotal(updated.available, updated.frozen),
      },
      manager,
    );

    return this.buildBalanceDto(userId, dto.currencyId, updated.available, updated.frozen);
  }

  private async transfer(
    userId: number,
    dto: WalletTransactionDto,
    amount: Decimal,
    manager: any,
  ): Promise<WalletBalanceDto> {
    if (!dto.targetUserId) {
      throw new BadRequestException('targetUserId is required for TRANSFER', 'TARGET_REQUIRED');
    }

    if (dto.targetUserId === userId) {
      throw new BadRequestException('Cannot transfer to the same user', 'INVALID_TARGET');
    }

    const [firstUserId, secondUserId] =
      userId < dto.targetUserId
        ? [userId, dto.targetUserId]
        : [dto.targetUserId, userId];

    const firstWallet = await this.walletRepository.getOrCreateForUpdate(
      firstUserId,
      dto.currencyId,
      manager,
    );
    const secondWallet = await this.walletRepository.getOrCreateForUpdate(
      secondUserId,
      dto.currencyId,
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
        currencyId: dto.currencyId,
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
        userId: dto.targetUserId,
        currencyId: dto.currencyId,
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
      dto.currencyId,
      sourceUpdated.available,
      sourceUpdated.frozen,
    );
  }

  private async applyDelta(
    walletId: number,
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
    userId: number,
    currencyId: number,
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
    } as WalletBalanceDto;
  }

  /**
   * Sync wallet balance with Binance exchange
   * Fetches actual balance from Binance and updates internal wallet
   */
  async syncBalanceWithExchange(
    userId: number,
    currencyId: number,
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
    userId: number,
    currencyId: number,
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
   * Process external deposit from exchange (Binance to internal wallet)
   */
  async processExternalDeposit(
    userId: number,
    currencyId: number,
    txId: string,
    amount: string,
    manager?: any,
  ): Promise<void> {
    const wallet = await this.walletRepository.findByUserCurrency(userId, currencyId);
    if (!wallet) {
      throw new BadRequestException(
        `Wallet not found for user ${userId} and currency ${currencyId}`,
      );
    }

    // Create deposit entry in ledger
    const newBalance = new Decimal(wallet.available ?? '0').plus(amount);

    await this.walletLedgerRepository.createEntry(
      {
        userId,
        currencyId,
        refType: WalletReferenceType.EXTERNAL_DEPOSIT,
        refId: parseInt(txId),
        direction: 'CREDIT',
        amount,
        balanceAfter: newBalance.toString(),
      },
      manager,
    );

    this.logger.log(
      `[External Deposit] User ${userId}, Currency ${currencyId}, Amount: ${amount}, TxId: ${txId}`,
    );
  }

  /**
   * Create withdrawal request to exchange (internal wallet to Binance)
   */
  async createWithdrawalRequest(
    userId: number,
    currencyId: number,
    amount: string,
    manager?: any,
  ): Promise<{ withdrawalId: string; status: string; amount: string }> {
    const wallet = await this.walletRepository.findByUserCurrency(userId, currencyId);
    if (!wallet) {
      throw new BadRequestException(
        `Wallet not found for user ${userId} and currency ${currencyId}`,
      );
    }

    // Check if user has enough balance
    const available = new Decimal(wallet.available ?? '0');
    const withdrawAmount = new Decimal(amount);

    if (available.lessThan(withdrawAmount)) {
      throw new BadRequestException(
        `Insufficient balance. Available: ${available}, Requested: ${withdrawAmount}`,
      );
    }

    // Create withdrawal entry
    const newBalance = available.minus(withdrawAmount);

    await this.walletLedgerRepository.createEntry(
      {
        userId,
        currencyId,
        refType: WalletReferenceType.EXTERNAL_WITHDRAWAL,
        refId: 0, // Will be updated after Binance accepts the withdrawal
        direction: 'DEBIT',
        amount,
        balanceAfter: newBalance.toString(),
      },
      manager,
    );

    this.logger.log(
      `[External Withdrawal] User ${userId}, Currency ${currencyId}, Amount: ${amount}`,
    );

    return {
      withdrawalId: `WITHDRAWAL_${userId}_${currencyId}_${Date.now()}`,
      status: 'PENDING',
      amount,
    };
  }
}
