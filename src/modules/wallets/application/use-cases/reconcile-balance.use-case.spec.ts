import { Test } from '@nestjs/testing';
import { WalletReferenceType } from '@/common/enums';
import { BadRequestException, BusinessException } from '@/common/exceptions';
import {
  EXCHANGE_SERVICE_PORT,
  WALLET_LEDGER_REPOSITORY,
  WALLET_REPOSITORY,
} from '@/modules/wallets/domain/ports';
import { BalanceCalculationService } from '@/modules/wallets/domain/services/balance-calculation.service';
import { ReconcileBalanceUseCase } from './reconcile-balance.use-case';

function makeWallet(available: string) {
  return { wallet_id: 'wid-1', available, frozen: '0' };
}

describe('ReconcileBalanceUseCase', () => {
  let useCase: ReconcileBalanceUseCase;

  let walletRepo: jest.Mocked<{ findByUserCurrency: jest.Mock }>;
  let ledgerRepo: jest.Mocked<{ createEntry: jest.Mock }>;
  let exchangeService: jest.Mocked<{ getBalance: jest.Mock }>;

  beforeEach(async () => {
    walletRepo = { findByUserCurrency: jest.fn() };
    ledgerRepo = { createEntry: jest.fn().mockResolvedValue({}) };
    exchangeService = { getBalance: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        ReconcileBalanceUseCase,
        BalanceCalculationService,
        { provide: WALLET_REPOSITORY, useValue: walletRepo },
        { provide: WALLET_LEDGER_REPOSITORY, useValue: ledgerRepo },
        { provide: EXCHANGE_SERVICE_PORT, useValue: exchangeService },
      ],
    }).compile();

    useCase = module.get(ReconcileBalanceUseCase);
  });

  it('returns BALANCED when internal equals external', async () => {
    walletRepo.findByUserCurrency.mockResolvedValue(makeWallet('100'));
    exchangeService.getBalance.mockResolvedValue({ available: '100', frozen: '0' });

    const result = await useCase.execute('uid-1', 'cid-1');

    expect(result.status).toBe('BALANCED');
    expect(result.discrepancy).toBe('0');
    expect(result.internalBalance).toBe('100');
    expect(result.externalBalance).toBe('100');
    expect(ledgerRepo.createEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        direction: 'DEBIT',
        amount: '0',
        refType: WalletReferenceType.RECONCILIATION,
      }),
      undefined,
    );
  });

  it('returns DISCREPANCY_DETECTED when external exceeds internal', async () => {
    walletRepo.findByUserCurrency.mockResolvedValue(makeWallet('100'));
    exchangeService.getBalance.mockResolvedValue({ available: '150', frozen: '0' });

    const result = await useCase.execute('uid-1', 'cid-1');

    expect(result.status).toBe('DISCREPANCY_DETECTED');
    expect(result.discrepancy).toBe('50');
    expect(ledgerRepo.createEntry).toHaveBeenCalledWith(
      expect.objectContaining({ direction: 'CREDIT', amount: '50' }),
      undefined,
    );
  });

  it('returns DISCREPANCY_DETECTED when internal exceeds external', async () => {
    walletRepo.findByUserCurrency.mockResolvedValue(makeWallet('200'));
    exchangeService.getBalance.mockResolvedValue({ available: '50', frozen: '0' });

    const result = await useCase.execute('uid-1', 'cid-1');

    expect(result.status).toBe('DISCREPANCY_DETECTED');
    expect(result.discrepancy).toBe('-150');
    expect(ledgerRepo.createEntry).toHaveBeenCalledWith(
      expect.objectContaining({ direction: 'DEBIT', amount: '150' }),
      undefined,
    );
  });

  it('throws BadRequestException when wallet not found', async () => {
    walletRepo.findByUserCurrency.mockResolvedValue(null);

    await expect(useCase.execute('uid-1', 'cid-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws BusinessException when exchange service fails', async () => {
    walletRepo.findByUserCurrency.mockResolvedValue(makeWallet('100'));
    exchangeService.getBalance.mockRejectedValue(new Error('Connection refused'));

    await expect(useCase.execute('uid-1', 'cid-1')).rejects.toBeInstanceOf(BusinessException);
  });

  it('swallows duplicate ledger entry error silently', async () => {
    walletRepo.findByUserCurrency.mockResolvedValue(makeWallet('100'));
    exchangeService.getBalance.mockResolvedValue({ available: '100', frozen: '0' });
    ledgerRepo.createEntry.mockRejectedValue(new Error("Duplicate entry 'uk_ledger_ref'"));

    // Should NOT throw — duplicates are expected on re-runs
    await expect(useCase.execute('uid-1', 'cid-1')).resolves.toBeDefined();
  });

  it('re-throws non-duplicate ledger errors', async () => {
    walletRepo.findByUserCurrency.mockResolvedValue(makeWallet('100'));
    exchangeService.getBalance.mockResolvedValue({ available: '100', frozen: '0' });
    ledgerRepo.createEntry.mockRejectedValue(new Error('Disk full'));

    await expect(useCase.execute('uid-1', 'cid-1')).rejects.toThrow('Disk full');
  });
});
