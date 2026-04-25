import { Inject, Injectable } from '@nestjs/common';
import Decimal from 'decimal.js';
import { OutboxIntegrationEventType } from '@/common/integration-events/integration-event-catalog';
import type { WalletBalanceChangedOutboxPayloadV1 } from '@/common/integration-events/wallet-balance-changed-outbox-payload';
import { OutboxAppender } from '@/common/outbox/outbox-appender.service';
import { WalletTransactionAction } from '@/common/enums';
import { BadRequestException, BusinessException, ConflictException } from '@/common/exceptions';
import type { TransactionContext } from '@/common/types/transaction-context';
import {
  CURRENCY_LOOKUP,
  type CurrencyLookupPort,
  WALLET_EVENT_PUBLISHER,
  WALLET_LEDGER_REPOSITORY,
  WALLET_REPOSITORY,
  type WalletEventPublisherPort,
  type WalletLedgerRepositoryPort,
  type WalletRepositoryPort,
} from '@/modules/wallets/domain/ports';
import {
  BalanceCalculationService,
  BalanceValidationError,
} from '@/modules/wallets/domain/services/balance-calculation.service';
import type { WalletBalanceDto } from '@/modules/wallets/dto/wallet-balance.dto';
import type { WalletTransactionDto } from '@/modules/wallets/dto/wallet-transaction.dto';

@Injectable()
export class ApplyTransactionUseCase {
  constructor(
    @Inject(WALLET_REPOSITORY) private readonly walletRepo: WalletRepositoryPort,
    @Inject(WALLET_LEDGER_REPOSITORY) private readonly ledgerRepo: WalletLedgerRepositoryPort,
    @Inject(WALLET_EVENT_PUBLISHER) private readonly eventPublisher: WalletEventPublisherPort,
    @Inject(CURRENCY_LOOKUP) private readonly currencyLookup: CurrencyLookupPort,
    private readonly balanceCalc: BalanceCalculationService,
    private readonly outboxAppender: OutboxAppender,
  ) {}

  async execute(
    userId: string,
    dto: WalletTransactionDto,
    joinTransaction?: TransactionContext,
  ): Promise<WalletBalanceDto> {
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
      const runCore = async (manager: TransactionContext) => {
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
      };

      const result = joinTransaction
        ? await runCore(joinTransaction)
        : await this.walletRepo.transaction(runCore);

      const symbol = await this.currencyLookup.getSymbol(currencyId);
      await this.eventPublisher.publishBalanceChange({
        userId,
        currencyId,
        symbol,
        available: result.available,
        frozen: result.frozen,
        total: this.balanceCalc.calculateTotal(result.available, result.frozen),
      });
      await this.appendWalletBalanceChangedEvent(
        joinTransaction ?? ({} as TransactionContext),
        userId,
        currencyId,
        symbol,
        result.available,
        result.frozen,
      );

      if (dto.action === WalletTransactionAction.TRANSFER && dto.targetUserId) {
        const _targetBalance = this.balanceCalc.buildBalanceSnapshot(
          String(dto.targetUserId),
          currencyId,
          '0',
          '0',
        );
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
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (
        typeof msg === 'string' &&
        msg.includes('Duplicate entry') &&
        msg.includes('uk_ledger_ref')
      ) {
        throw new ConflictException(
          'Duplicate transaction reference. Please try again.',
          'DUPLICATE_LEDGER_ENTRY',
        );
      }
      throw err;
    }
  }

  private async appendWalletBalanceChangedEvent(
    manager: TransactionContext,
    userId: string,
    currencyId: string,
    symbol: string,
    available: string,
    frozen: string,
  ): Promise<void> {
    const total = this.balanceCalc.calculateTotal(available, frozen);
    const payload: WalletBalanceChangedOutboxPayloadV1 = {
      userId,
      currencyId,
      symbol,
      available,
      frozen,
      total,
      updatedAt: new Date().toISOString(),
    };

    await this.outboxAppender.append(manager as never, {
      aggregateType: 'wallet',
      aggregateId: `${userId}:${currencyId}`,
      eventType: OutboxIntegrationEventType.WalletBalanceChangedV1,
      payload: payload as unknown as Record<string, unknown>,
      partitionKey: currencyId,
      kafkaTopic: 'wallet.balance',
    });
  }

  private async credit(
    userId: string,
    dto: WalletTransactionDto,
    amount: Decimal,
    manager: TransactionContext,
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

    return this.balanceCalc.buildBalanceSnapshot(
      userId,
      currencyId,
      updated.available,
      updated.frozen,
    );
  }

  private async debit(
    userId: string,
    dto: WalletTransactionDto,
    amount: Decimal,
    manager: TransactionContext,
  ): Promise<WalletBalanceDto> {
    const currencyId = String(dto.currencyId);
    const wallet = await this.walletRepo.getOrCreateForUpdate(userId, currencyId, manager);
    const updated = await this.applyDelta(
      wallet.wallet_id,
      amount.negated(),
      new Decimal(0),
      manager,
    );

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

    return this.balanceCalc.buildBalanceSnapshot(
      userId,
      currencyId,
      updated.available,
      updated.frozen,
    );
  }

  private async freeze(
    userId: string,
    dto: WalletTransactionDto,
    amount: Decimal,
    manager: TransactionContext,
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

    return this.balanceCalc.buildBalanceSnapshot(
      userId,
      currencyId,
      updated.available,
      updated.frozen,
    );
  }

  private async unfreeze(
    userId: string,
    dto: WalletTransactionDto,
    amount: Decimal,
    manager: TransactionContext,
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

    return this.balanceCalc.buildBalanceSnapshot(
      userId,
      currencyId,
      updated.available,
      updated.frozen,
    );
  }

  private async transfer(
    userId: string,
    dto: WalletTransactionDto,
    amount: Decimal,
    manager: TransactionContext,
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
    const firstWallet = await this.walletRepo.getOrCreateForUpdate(
      firstUserId,
      currencyId,
      manager,
    );
    const secondWallet = await this.walletRepo.getOrCreateForUpdate(
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

    await this.ledgerRepo.createDoubleEntry(
      {
        userId,
        currencyId,
        refType: dto.refType,
        refId: dto.refId,
        amount: amount.toString(),
        balanceAfter: this.balanceCalc.calculateTotal(
          sourceUpdated.available,
          sourceUpdated.frozen,
        ),
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
        balanceAfter: this.balanceCalc.calculateTotal(
          targetUpdated.available,
          targetUpdated.frozen,
        ),
      },
      manager,
    );

    return this.balanceCalc.buildBalanceSnapshot(
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
    manager: TransactionContext,
  ) {
    try {
      return await this.walletRepo.applyBalanceDelta(
        walletId,
        deltaAvailable.toString(),
        deltaFrozen.toString(),
        manager,
      );
    } catch (error: unknown) {
      if (error instanceof Error && error.message.includes('Insufficient')) {
        throw new BusinessException('Insufficient balance', 'INSUFFICIENT_BALANCE');
      }
      throw error;
    }
  }
}
