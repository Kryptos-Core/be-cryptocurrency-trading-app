import { Inject, Injectable, Logger } from '@nestjs/common';
import Decimal from 'decimal.js';
import { WalletReferenceType, WalletTransactionAction } from '@/common/enums';
import { BadRequestException, BusinessException, ConflictException } from '@/common/exceptions';
import { OutboxIntegrationEventType } from '@/common/integration-events/integration-event-catalog';
import type { WalletBalanceChangedOutboxPayloadV1 } from '@/common/integration-events/wallet-balance-changed-outbox-payload';
import { OutboxAppender } from '@/common/outbox/outbox-appender.service';
import type { TransactionContext } from '@/common/types/transaction-context';
import { newUuid } from '@/common/utils/uuid.util';
import {
  ADMIN_ADJUSTMENT_REPOSITORY,
  type AdminAdjustmentRepositoryPort,
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
import type {
  AdminAdjustWalletDto,
  AdminAdjustWalletResponseDto,
} from '@/modules/wallets/dto/admin-adjust-wallet.dto';

@Injectable()
export class AdminAdjustBalanceUseCase {
  private readonly logger = new Logger(AdminAdjustBalanceUseCase.name);

  constructor(
    @Inject(WALLET_REPOSITORY) private readonly walletRepo: WalletRepositoryPort,
    @Inject(WALLET_LEDGER_REPOSITORY) private readonly ledgerRepo: WalletLedgerRepositoryPort,
    @Inject(ADMIN_ADJUSTMENT_REPOSITORY)
    private readonly adjustmentRepo: AdminAdjustmentRepositoryPort,
    @Inject(WALLET_EVENT_PUBLISHER) private readonly eventPublisher: WalletEventPublisherPort,
    @Inject(CURRENCY_LOOKUP) private readonly currencyLookup: CurrencyLookupPort,
    private readonly balanceCalc: BalanceCalculationService,
    private readonly outboxAppender: OutboxAppender,
  ) {}

  async execute(
    actorUserId: string,
    dto: AdminAdjustWalletDto,
  ): Promise<AdminAdjustWalletResponseDto> {
    const adjustmentId = newUuid();
    let amount: Decimal;
    try {
      amount = this.balanceCalc.parsePositiveAmount(dto.amount);
    } catch (err) {
      if (err instanceof BalanceValidationError) {
        throw new BadRequestException(err.message, err.code);
      }
      throw err;
    }

    let updatedBalance: { available: string; frozen: string } | null = null;

    try {
      const result = await this.walletRepo.transaction(async (manager) => {
        const adjustment = await this.adjustmentRepo.createAdjustment(
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
          dto.type === 'DEPOSIT' ? WalletTransactionAction.CREDIT : WalletTransactionAction.DEBIT;

        const wallet = await this.walletRepo.getOrCreateForUpdate(
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

        await this.ledgerRepo.createEntry(
          {
            userId: dto.userId,
            currencyId: dto.currencyId,
            refType: WalletReferenceType.ADJUST,
            refId: adjustmentId,
            direction: action === WalletTransactionAction.CREDIT ? 'CREDIT' : 'DEBIT',
            amount: amount.toString(),
            balanceAfter: this.balanceCalc.calculateTotal(updated.available, updated.frozen),
          },
          manager,
        );

        this.logger.log(
          `[AdminAdjust] actor=${actorUserId} type=${dto.type} amount=${dto.amount} target=${dto.userId} currency=${dto.currencyId} adjustmentId=${adjustmentId}`,
        );

        return adjustment;
      });

      const balanceSnapshot = updatedBalance as { available: string; frozen: string } | null;
      if (balanceSnapshot) {
        const symbol = await this.currencyLookup.getSymbol(dto.currencyId);
        await this.eventPublisher.publishBalanceChange({
          userId: dto.userId,
          currencyId: dto.currencyId,
          symbol,
          available: balanceSnapshot.available,
          frozen: balanceSnapshot.frozen,
          total: this.balanceCalc.calculateTotal(balanceSnapshot.available, balanceSnapshot.frozen),
        });
        await this.appendWalletBalanceChangedEvent(
          dto.userId,
          dto.currencyId,
          symbol,
          balanceSnapshot.available,
          balanceSnapshot.frozen,
          adjustmentId,
        );
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
    userId: string,
    currencyId: string,
    symbol: string,
    available: string,
    frozen: string,
    adjustmentId: string,
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

    await this.walletRepo.transaction(async (manager) => {
      await this.outboxAppender.append(manager as never, {
        aggregateType: 'wallet',
        aggregateId: `${userId}:${currencyId}`,
        eventType: OutboxIntegrationEventType.WalletBalanceChangedV1,
        payload: payload as unknown as Record<string, unknown>,
        dedupeKey: `wallet-balance-adjust:${adjustmentId}`,
        causationId: adjustmentId,
        partitionKey: currencyId,
        kafkaTopic: 'wallet.balance',
      });
    });
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
