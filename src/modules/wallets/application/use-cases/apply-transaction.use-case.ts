import { Inject, Injectable, Logger } from '@nestjs/common';
import Decimal from 'decimal.js';
import { WalletTransactionAction } from '@/common/enums';
import { BadRequestException, BusinessException, ConflictException } from '@/common/exceptions';
import {
  WALLET_REPOSITORY,
  type WalletRepositoryPort,
  WALLET_LEDGER_REPOSITORY,
  type WalletLedgerRepositoryPort,
  WALLET_EVENT_PUBLISHER,
  type WalletEventPublisherPort,
  CURRENCY_LOOKUP,
  type CurrencyLookupPort,
} from '@/modules/wallets/domain/ports';
import {
  BalanceCalculationService,
  BalanceValidationError,
} from '@/modules/wallets/domain/services/balance-calculation.service';
import type { WalletBalanceDto } from '@/modules/wallets/dto/wallet-balance.dto';
import type { WalletTransactionDto } from '@/modules/wallets/dto/wallet-transaction.dto';

@Injectable()
export class ApplyTransactionUseCase {
  private readonly logger = new Logger(ApplyTransactionUseCase.name);

  constructor(
    @Inject(WALLET_REPOSITORY) private readonly walletRepo: WalletRepositoryPort,
    @Inject(WALLET_LEDGER_REPOSITORY) private readonly ledgerRepo: WalletLedgerRepositoryPort,
    @Inject(WALLET_EVENT_PUBLISHER) private readonly eventPublisher: WalletEventPublisherPort,
    @Inject(CURRENCY_LOOKUP) private readonly currencyLookup: CurrencyLookupPort,
    private readonly balanceCalc: BalanceCalculationService,
  ) {}

  async execute(userId: string, dto: WalletTransactionDto): Promise<WalletBalanceDto> {
    let amount: Decimal;
    try {
      amount = this.balanceCalc.parsePositiveAmount(dto.amount);
    } catch (err) {
      if (err instanceof BalanceValidationError) {
        throw new BadRequestException(err.message, err.code);
      }
      throw err;
    }

    const currencyId = String(dto.currencyId);

    try {
      const result = await this.walletRepo.transaction(async (manager) => {
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

      const symbol = await this.currencyLookup.getSymbol(currencyId);
      await this.eventPublisher.publishBalanceChange({
        userId,
        currencyId,
        symbol,
        available: result.available,
        frozen: result.frozen,
        total: this.balanceCalc.calculateTotal(result.available, result.frozen),
      });

      if (dto.action === WalletTransactionAction.TRANSFER && dto.targetUserId) {
        const targetBalance = this.balanceCalc.buildBalanceSnapshot(
          String(dto.targetUserId),
          currencyId,
          '0',
          '0',
        );
        // Re-fetch target balance for accurate event
        const targetWallet = await this.walletRepo.findByUserCurrency(
          String(dto.targetUserId),
          currencyId,
        );
        if (targetWallet) {
          const tSnap = this.balanceCalc.buildBalanceSnapshot(
            String(dto.targetUserId),
            currencyId,
            targetWallet.available ?? '0',
            targetWallet.frozen ?? '0',
          );
          await this.eventPublisher.publishBalanceChange({
            userId: tSnap.userId,
            currencyId,
            symbol,
            available: tSnap.available,
            frozen: tSnap.frozen,
            total: tSnap.total,
          });
        }
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
    const wallet = await this.walletRepo.getOrCreateForUpdate(userId, currencyId, manager);
    const updated = await this.applyDelta(wallet.wallet_id, amount, new Decimal(0), manager);

    await this.ledgerRepo.createEntry(
      {
        userId,
        currencyId,
        refType: dto.refType,
        refId: dto.refId,
        direction: 'CREDIT',
        amount: amount.toString(),
        balanceAfter: this.balanceCalc.calculateTotal(updated.available, updated.frozen),
      },
      manager,
    );

    return this.balanceCalc.buildBalanceSnapshot(userId, currencyId, updated.available, updated.frozen);
  }

  private async debit(
    userId: string,
    dto: WalletTransactionDto,
    amount: Decimal,
    manager: any,
  ): Promise<WalletBalanceDto> {
    const currencyId = String(dto.currencyId);
    const wallet = await this.walletRepo.getOrCreateForUpdate(userId, currencyId, manager);
    const updated = await this.applyDelta(wallet.wallet_id, amount.negated(), new Decimal(0), manager);

    await this.ledgerRepo.createEntry(
      {
        userId,
        currencyId,
        refType: dto.refType,
        refId: dto.refId,
        direction: 'DEBIT',
        amount: amount.toString(),
        balanceAfter: this.balanceCalc.calculateTotal(updated.available, updated.frozen),
      },
      manager,
    );

    return this.balanceCalc.buildBalanceSnapshot(userId, currencyId, updated.available, updated.frozen);
  }

  private async freeze(
    userId: string,
    dto: WalletTransactionDto,
    amount: Decimal,
    manager: any,
  ): Promise<WalletBalanceDto> {
    const currencyId = String(dto.currencyId);
    const wallet = await this.walletRepo.getOrCreateForUpdate(userId, currencyId, manager);
    const updated = await this.applyDelta(wallet.wallet_id, amount.negated(), amount, manager);

    await this.ledgerRepo.createDoubleEntry(
      {
        userId,
        currencyId,
        refType: dto.refType,
        refId: dto.refId,
        amount: amount.toString(),
        balanceAfter: this.balanceCalc.calculateTotal(updated.available, updated.frozen),
      },
      manager,
    );

    return this.balanceCalc.buildBalanceSnapshot(userId, currencyId, updated.available, updated.frozen);
  }

  private async unfreeze(
    userId: string,
    dto: WalletTransactionDto,
    amount: Decimal,
    manager: any,
  ): Promise<WalletBalanceDto> {
    const currencyId = String(dto.currencyId);
    const wallet = await this.walletRepo.getOrCreateForUpdate(userId, currencyId, manager);
    const updated = await this.applyDelta(wallet.wallet_id, amount, amount.negated(), manager);

    await this.ledgerRepo.createDoubleEntry(
      {
        userId,
        currencyId,
        refType: dto.refType,
        refId: dto.refId,
        amount: amount.toString(),
        balanceAfter: this.balanceCalc.calculateTotal(updated.available, updated.frozen),
      },
      manager,
    );

    return this.balanceCalc.buildBalanceSnapshot(userId, currencyId, updated.available, updated.frozen);
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

    // Deterministic lock order to prevent deadlocks
    const [firstUserId, secondUserId] =
      userId.localeCompare(targetId) < 0 ? [userId, targetId] : [targetId, userId];

    const currencyId = String(dto.currencyId);
    const firstWallet = await this.walletRepo.getOrCreateForUpdate(firstUserId, currencyId, manager);
    const secondWallet = await this.walletRepo.getOrCreateForUpdate(secondUserId, currencyId, manager);

    const sourceWallet = userId === firstUserId ? firstWallet : secondWallet;
    const targetWallet = userId === firstUserId ? secondWallet : firstWallet;

    const sourceUpdated = await this.applyDelta(sourceWallet.wallet_id, amount.negated(), new Decimal(0), manager);
    const targetUpdated = await this.applyDelta(targetWallet.wallet_id, amount, new Decimal(0), manager);

    await this.ledgerRepo.createDoubleEntry(
      {
        userId,
        currencyId,
        refType: dto.refType,
        refId: dto.refId,
        amount: amount.toString(),
        balanceAfter: this.balanceCalc.calculateTotal(sourceUpdated.available, sourceUpdated.frozen),
      },
      manager,
    );

    await this.ledgerRepo.createDoubleEntry(
      {
        userId: targetId,
        currencyId,
        refType: dto.refType,
        refId: dto.refId,
        amount: amount.toString(),
        balanceAfter: this.balanceCalc.calculateTotal(targetUpdated.available, targetUpdated.frozen),
      },
      manager,
    );

    return this.balanceCalc.buildBalanceSnapshot(userId, currencyId, sourceUpdated.available, sourceUpdated.frozen);
  }

  private async applyDelta(
    walletId: string,
    deltaAvailable: Decimal,
    deltaFrozen: Decimal,
    manager: any,
  ) {
    try {
      return await this.walletRepo.applyBalanceDelta(
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
}
