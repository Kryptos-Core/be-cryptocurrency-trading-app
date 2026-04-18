import { Test } from '@nestjs/testing';
import { WalletReferenceType, WalletTransactionAction } from '@/common/enums';
import { BadRequestException, BusinessException, ConflictException } from '@/common/exceptions';
import type { TransactionContext } from '@/common/types/transaction-context';
import {
  CURRENCY_LOOKUP,
  WALLET_EVENT_PUBLISHER,
  WALLET_LEDGER_REPOSITORY,
  WALLET_REPOSITORY,
} from '@/modules/wallets/domain/ports';
import { BalanceCalculationService } from '@/modules/wallets/domain/services/balance-calculation.service';
import type { WalletTransactionDto } from '@/modules/wallets/dto/wallet-transaction.dto';
import { ApplyTransactionUseCase } from './apply-transaction.use-case';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeWallet(available: string, frozen: string) {
  return { wallet_id: 'wid-1', available, frozen };
}

/** Builds a minimal WalletTransactionDto. */
function dto(overrides: Partial<WalletTransactionDto> = {}): WalletTransactionDto {
  return {
    currencyId: 'cid-1',
    amount: '100',
    action: WalletTransactionAction.CREDIT,
    refType: WalletReferenceType.DEPOSIT,
    refId: 1,
    ...overrides,
  } as WalletTransactionDto;
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe('ApplyTransactionUseCase', () => {
  let useCase: ApplyTransactionUseCase;

  let walletRepo: jest.Mocked<{
    getOrCreateForUpdate: jest.Mock;
    applyBalanceDelta: jest.Mock;
    findByUserCurrency: jest.Mock;
    transaction: jest.Mock;
  }>;
  let ledgerRepo: jest.Mocked<{ createEntry: jest.Mock; createDoubleEntry: jest.Mock }>;
  let eventPublisher: jest.Mocked<{ publishBalanceChange: jest.Mock }>;
  let currencyLookup: jest.Mocked<{ getSymbol: jest.Mock }>;

  beforeEach(async () => {
    walletRepo = {
      getOrCreateForUpdate: jest.fn(),
      applyBalanceDelta: jest.fn(),
      findByUserCurrency: jest.fn(),
      transaction: jest.fn(),
    };

    // Make transaction() transparently execute its callback
    walletRepo.transaction.mockImplementation((fn: (ctx: object) => Promise<unknown>) => fn({}));

    ledgerRepo = {
      createEntry: jest.fn().mockResolvedValue({}),
      createDoubleEntry: jest.fn().mockResolvedValue([{}, {}]),
    };

    eventPublisher = {
      publishBalanceChange: jest.fn().mockResolvedValue(undefined),
    };

    currencyLookup = {
      getSymbol: jest.fn().mockResolvedValue('BTC'),
    };

    const module = await Test.createTestingModule({
      providers: [
        ApplyTransactionUseCase,
        BalanceCalculationService,
        { provide: WALLET_REPOSITORY, useValue: walletRepo },
        { provide: WALLET_LEDGER_REPOSITORY, useValue: ledgerRepo },
        { provide: WALLET_EVENT_PUBLISHER, useValue: eventPublisher },
        { provide: CURRENCY_LOOKUP, useValue: currencyLookup },
      ],
    }).compile();

    useCase = module.get(ApplyTransactionUseCase);
  });

  // ── CREDIT ────────────────────────────────────────────────────────────────

  describe('CREDIT', () => {
    it('credits available balance and publishes event', async () => {
      walletRepo.getOrCreateForUpdate.mockResolvedValue(makeWallet('200', '0'));
      walletRepo.applyBalanceDelta.mockResolvedValue(makeWallet('300', '0'));

      const result = await useCase.execute(
        'uid-1',
        dto({ action: WalletTransactionAction.CREDIT }),
      );

      expect(walletRepo.applyBalanceDelta).toHaveBeenCalledWith(
        'wid-1',
        '100', // +deltaAvailable
        '0', // no frozen delta
        {},
      );
      expect(ledgerRepo.createEntry).toHaveBeenCalledWith(
        expect.objectContaining({ direction: 'CREDIT', amount: '100' }),
        {},
      );
      expect(eventPublisher.publishBalanceChange).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'uid-1', available: '300', frozen: '0', total: '300' }),
      );
      expect(result).toEqual({
        userId: 'uid-1',
        currencyId: 'cid-1',
        available: '300',
        frozen: '0',
        total: '300',
      });
    });

    it('runs in provided join transaction without starting walletRepo.transaction', async () => {
      walletRepo.getOrCreateForUpdate.mockResolvedValue(makeWallet('200', '0'));
      walletRepo.applyBalanceDelta.mockResolvedValue(makeWallet('300', '0'));
      const joinCtx = { joined: true } as unknown as TransactionContext;

      await useCase.execute('uid-1', dto({ action: WalletTransactionAction.CREDIT }), joinCtx);

      expect(walletRepo.transaction).not.toHaveBeenCalled();
      expect(walletRepo.applyBalanceDelta).toHaveBeenCalledWith('wid-1', '100', '0', joinCtx);
    });
  });

  // ── DEBIT ─────────────────────────────────────────────────────────────────

  describe('DEBIT', () => {
    it('debits available balance and publishes event', async () => {
      walletRepo.getOrCreateForUpdate.mockResolvedValue(makeWallet('300', '0'));
      walletRepo.applyBalanceDelta.mockResolvedValue(makeWallet('200', '0'));

      await useCase.execute('uid-1', dto({ action: WalletTransactionAction.DEBIT }));

      expect(walletRepo.applyBalanceDelta).toHaveBeenCalledWith('wid-1', '-100', '0', {});
      expect(ledgerRepo.createEntry).toHaveBeenCalledWith(
        expect.objectContaining({ direction: 'DEBIT', amount: '100' }),
        {},
      );
    });

    it('throws BusinessException when balance is insufficient', async () => {
      walletRepo.getOrCreateForUpdate.mockResolvedValue(makeWallet('50', '0'));
      walletRepo.applyBalanceDelta.mockRejectedValue(new Error('Insufficient balance'));

      await expect(
        useCase.execute('uid-1', dto({ action: WalletTransactionAction.DEBIT })),
      ).rejects.toBeInstanceOf(BusinessException);
    });
  });

  // ── FREEZE ────────────────────────────────────────────────────────────────

  describe('FREEZE', () => {
    it('moves available → frozen via double entry', async () => {
      walletRepo.getOrCreateForUpdate.mockResolvedValue(makeWallet('200', '0'));
      walletRepo.applyBalanceDelta.mockResolvedValue(makeWallet('100', '100'));

      await useCase.execute('uid-1', dto({ action: WalletTransactionAction.FREEZE }));

      // delta: available -= 100, frozen += 100
      expect(walletRepo.applyBalanceDelta).toHaveBeenCalledWith('wid-1', '-100', '100', {});
      expect(ledgerRepo.createDoubleEntry).toHaveBeenCalled();
    });
  });

  // ── UNFREEZE ──────────────────────────────────────────────────────────────

  describe('UNFREEZE', () => {
    it('moves frozen → available via double entry', async () => {
      walletRepo.getOrCreateForUpdate.mockResolvedValue(makeWallet('0', '100'));
      walletRepo.applyBalanceDelta.mockResolvedValue(makeWallet('100', '0'));

      await useCase.execute('uid-1', dto({ action: WalletTransactionAction.UNFREEZE }));

      // delta: available += 100, frozen -= 100
      expect(walletRepo.applyBalanceDelta).toHaveBeenCalledWith('wid-1', '100', '-100', {});
      expect(ledgerRepo.createDoubleEntry).toHaveBeenCalled();
    });
  });

  // ── TRANSFER ──────────────────────────────────────────────────────────────

  describe('TRANSFER', () => {
    it('transfers between two different users and publishes two events', async () => {
      walletRepo.getOrCreateForUpdate
        .mockResolvedValueOnce(makeWallet('500', '0')) // first lock (uid-1 < uid-2)
        .mockResolvedValueOnce(makeWallet('0', '0')); // second lock

      walletRepo.applyBalanceDelta
        .mockResolvedValueOnce(makeWallet('400', '0')) // source debit
        .mockResolvedValueOnce(makeWallet('100', '0')); // target credit

      walletRepo.findByUserCurrency.mockResolvedValue(makeWallet('100', '0'));

      await useCase.execute(
        'uid-1',
        dto({ action: WalletTransactionAction.TRANSFER, amount: '100', targetUserId: 2 as any }),
      );

      expect(walletRepo.applyBalanceDelta).toHaveBeenCalledTimes(2);
      expect(ledgerRepo.createDoubleEntry).toHaveBeenCalledTimes(2);
      expect(eventPublisher.publishBalanceChange).toHaveBeenCalledTimes(2);
    });

    it('throws BadRequestException when targetUserId is missing', async () => {
      await expect(
        useCase.execute('uid-1', dto({ action: WalletTransactionAction.TRANSFER })),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws BadRequestException when source and target are the same user', async () => {
      await expect(
        useCase.execute(
          '1',
          dto({ action: WalletTransactionAction.TRANSFER, targetUserId: 1 as any }),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ── Validation ────────────────────────────────────────────────────────────

  describe('amount validation', () => {
    it('throws BadRequestException for zero amount', async () => {
      await expect(useCase.execute('uid-1', dto({ amount: '0' }))).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('throws BadRequestException for negative amount', async () => {
      await expect(useCase.execute('uid-1', dto({ amount: '-50' }))).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('throws BadRequestException for non-numeric amount', async () => {
      await expect(useCase.execute('uid-1', dto({ amount: 'abc' }))).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  // ── Idempotency ───────────────────────────────────────────────────────────

  describe('duplicate ledger detection', () => {
    it('throws ConflictException on duplicate ledger entry', async () => {
      walletRepo.getOrCreateForUpdate.mockResolvedValue(makeWallet('200', '0'));
      walletRepo.applyBalanceDelta.mockResolvedValue(makeWallet('300', '0'));
      ledgerRepo.createEntry.mockRejectedValue(
        new Error("Duplicate entry 'x' for key 'uk_ledger_ref'"),
      );

      await expect(useCase.execute('uid-1', dto())).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
