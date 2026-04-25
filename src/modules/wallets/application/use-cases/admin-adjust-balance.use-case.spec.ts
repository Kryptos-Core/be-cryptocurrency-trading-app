import { Test } from '@nestjs/testing';
import { OutboxAppender } from '@/common/outbox/outbox-appender.service';
import { WalletReferenceType } from '@/common/enums';
import { BadRequestException, BusinessException, ConflictException } from '@/common/exceptions';
import {
  ADMIN_ADJUSTMENT_REPOSITORY,
  CURRENCY_LOOKUP,
  WALLET_EVENT_PUBLISHER,
  WALLET_LEDGER_REPOSITORY,
  WALLET_REPOSITORY,
} from '@/modules/wallets/domain/ports';
import { BalanceCalculationService } from '@/modules/wallets/domain/services/balance-calculation.service';
import type { AdminAdjustWalletDto } from '@/modules/wallets/dto/admin-adjust-wallet.dto';
import { AdminAdjustBalanceUseCase } from './admin-adjust-balance.use-case';

function makeWallet(available: string, frozen: string) {
  return { wallet_id: 'wid-1', available, frozen };
}

function dto(overrides: Partial<AdminAdjustWalletDto> = {}): AdminAdjustWalletDto {
  return {
    userId: 'target-uid',
    currencyId: 'cid-1',
    amount: '100',
    type: 'DEPOSIT',
    ...overrides,
  } as AdminAdjustWalletDto;
}

describe('AdminAdjustBalanceUseCase', () => {
  let useCase: AdminAdjustBalanceUseCase;

  let walletRepo: jest.Mocked<{
    getOrCreateForUpdate: jest.Mock;
    applyBalanceDelta: jest.Mock;
    transaction: jest.Mock;
  }>;
  let ledgerRepo: jest.Mocked<{ createEntry: jest.Mock }>;
  let adjustmentRepo: jest.Mocked<{ createAdjustment: jest.Mock }>;
  let eventPublisher: jest.Mocked<{ publishBalanceChange: jest.Mock }>;
  let currencyLookup: jest.Mocked<{ getSymbol: jest.Mock }>;
  let outboxAppender: jest.Mocked<{ append: jest.Mock }>;

  beforeEach(async () => {
    walletRepo = {
      getOrCreateForUpdate: jest.fn(),
      applyBalanceDelta: jest.fn(),
      transaction: jest.fn(),
    };

    walletRepo.transaction.mockImplementation((fn: (ctx: object) => Promise<unknown>) => fn({}));

    ledgerRepo = { createEntry: jest.fn().mockResolvedValue({}) };
    adjustmentRepo = {
      createAdjustment: jest.fn().mockImplementation(async (params) => ({
        adjustmentId: params.adjustmentId,
        actorUserId: params.actorUserId,
        targetUserId: params.targetUserId,
        currencyId: params.currencyId,
        amount: params.amount,
        type: params.type,
        note: params.note ?? null,
        createdAt: new Date().toISOString(),
      })),
    };
    eventPublisher = {
      publishBalanceChange: jest.fn().mockResolvedValue(undefined),
    };
    currencyLookup = { getSymbol: jest.fn().mockResolvedValue('BTC') };
    outboxAppender = { append: jest.fn().mockResolvedValue(undefined) };

    const module = await Test.createTestingModule({
      providers: [
        AdminAdjustBalanceUseCase,
        BalanceCalculationService,
        { provide: WALLET_REPOSITORY, useValue: walletRepo },
        { provide: WALLET_LEDGER_REPOSITORY, useValue: ledgerRepo },
        { provide: ADMIN_ADJUSTMENT_REPOSITORY, useValue: adjustmentRepo },
        { provide: WALLET_EVENT_PUBLISHER, useValue: eventPublisher },
        { provide: CURRENCY_LOOKUP, useValue: currencyLookup },
        { provide: OutboxAppender, useValue: outboxAppender },
      ],
    }).compile();

    useCase = module.get(AdminAdjustBalanceUseCase);
  });

  describe('DEPOSIT type', () => {
    it('creates adjustment, credits wallet, writes ledger entry, publishes event and appends outbox event', async () => {
      walletRepo.getOrCreateForUpdate.mockResolvedValue(makeWallet('200', '0'));
      walletRepo.applyBalanceDelta.mockResolvedValue(makeWallet('300', '0'));

      const result = await useCase.execute('admin-uid', dto({ type: 'DEPOSIT' }));

      expect(adjustmentRepo.createAdjustment).toHaveBeenCalledWith(
        expect.objectContaining({
          actorUserId: 'admin-uid',
          targetUserId: 'target-uid',
          currencyId: 'cid-1',
          amount: '100',
          type: 'DEPOSIT',
        }),
        {},
      );
      expect(walletRepo.applyBalanceDelta).toHaveBeenCalledWith('wid-1', '100', '0', {});
      expect(ledgerRepo.createEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'target-uid',
          direction: 'CREDIT',
          amount: '100',
          refType: WalletReferenceType.ADJUST,
        }),
        {},
      );
      expect(eventPublisher.publishBalanceChange).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'target-uid',
          currencyId: 'cid-1',
          symbol: 'BTC',
          available: '300',
          frozen: '0',
          total: '300',
        }),
      );
      expect(outboxAppender.append).toHaveBeenCalledWith(
        {},
        expect.objectContaining({
          aggregateType: 'wallet',
          aggregateId: 'target-uid:cid-1',
          eventType: 'wallet.balance_changed',
          kafkaTopic: 'wallet.balance',
        }),
      );
      expect(result.adjustmentId).toBeDefined();
      expect(result.type).toBe('DEPOSIT');
    });
  });

  describe('WITHDRAW type', () => {
    it('creates adjustment, debits wallet, writes ledger entry and appends outbox event', async () => {
      walletRepo.getOrCreateForUpdate.mockResolvedValue(makeWallet('200', '0'));
      walletRepo.applyBalanceDelta.mockResolvedValue(makeWallet('100', '0'));

      await useCase.execute('admin-uid', dto({ type: 'WITHDRAW' }));

      expect(walletRepo.applyBalanceDelta).toHaveBeenCalledWith('wid-1', '-100', '0', {});
      expect(ledgerRepo.createEntry).toHaveBeenCalledWith(
        expect.objectContaining({ direction: 'DEBIT' }),
        {},
      );
      expect(outboxAppender.append).toHaveBeenCalledTimes(1);
    });

    it('throws BusinessException when insufficient balance for WITHDRAW', async () => {
      walletRepo.getOrCreateForUpdate.mockResolvedValue(makeWallet('50', '0'));
      walletRepo.applyBalanceDelta.mockRejectedValue(new Error('Insufficient balance'));

      await expect(useCase.execute('admin-uid', dto({ type: 'WITHDRAW' }))).rejects.toBeInstanceOf(
        BusinessException,
      );
    });
  });

  describe('amount validation', () => {
    it('throws BadRequestException for zero amount', async () => {
      await expect(useCase.execute('admin-uid', dto({ amount: '0' }))).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('throws BadRequestException for negative amount', async () => {
      await expect(useCase.execute('admin-uid', dto({ amount: '-50' }))).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('throws BadRequestException for non-numeric amount', async () => {
      await expect(useCase.execute('admin-uid', dto({ amount: 'abc' }))).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('duplicate ledger entry', () => {
    it('throws ConflictException on duplicate ledger ref', async () => {
      walletRepo.getOrCreateForUpdate.mockResolvedValue(makeWallet('200', '0'));
      walletRepo.applyBalanceDelta.mockResolvedValue(makeWallet('300', '0'));
      ledgerRepo.createEntry.mockRejectedValue(
        new Error("Duplicate entry for key 'uk_ledger_ref'"),
      );

      await expect(useCase.execute('admin-uid', dto())).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
