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
import { WalletTransactionAction, WalletReferenceType } from './wallet.types';

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
    const total = this.calculateTotal(available, frozen);
    return {
      userId,
      currencyId,
      available: available ?? '0',
      frozen: frozen ?? '0',
      total,
    } as WalletBalanceDto;
  }
}
