import { Test } from '@nestjs/testing';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
 EXCHANGE_SERVICE_PORT,
 WALLET_LEDGER_REPOSITORY,
 WALLET_REPOSITORY,
} from '@/modules/wallets/domain/ports';
import { BalanceCalculationService } from '@/modules/wallets/domain/services/balance-calculation.service';
import { ReconcileBalanceUseCase } from './reconcile-balance.use-case';
import { ExportReconciliationReportUseCase } from './export-reconciliation-report.use-case';

const TEST_REPORT_DIR = path.join(process.cwd(), 'reports', 'reconciliation');

function mockFs() {
 const originalReadFile = jest.spyOn(fs, 'readFile');
 const originalWriteFile = jest.spyOn(fs, 'writeFile');
 const originalMkdir = jest.spyOn(fs, 'mkdir');

 beforeEach(() => {
 originalReadFile.mockRejectedValue(new Error('ENOENT'));
 originalWriteFile.mockResolvedValue(undefined);
 originalMkdir.mockResolvedValue(undefined);
 });

 afterEach(() => {
 originalReadFile.mockRestore();
 originalWriteFile.mockRestore();
 originalMkdir.mockRestore();
 });
}

describe('ExportReconciliationReportUseCase', () => {
 let useCase: ExportReconciliationReportUseCase;
 let reconcileUseCase: ReconcileBalanceUseCase;

 let walletRepo: jest.Mocked<{ findWalletPairs: jest.Mock }>;
 let ledgerRepo: jest.Mocked<{ createEntry: jest.Mock }>;
 let exchangeService: jest.Mocked<{ getBalance: jest.Mock }>;

 beforeEach(async () => {
 walletRepo = { findWalletPairs: jest.fn() };
 ledgerRepo = { createEntry: jest.fn().mockResolvedValue({}) };
 exchangeService = { getBalance: jest.fn() };

 const module = await Test.createTestingModule({
 providers: [
 ExportReconciliationReportUseCase,
 ReconcileBalanceUseCase,
 BalanceCalculationService,
 { provide: WALLET_REPOSITORY, useValue: walletRepo },
 { provide: WALLET_LEDGER_REPOSITORY, useValue: ledgerRepo },
 { provide: EXCHANGE_SERVICE_PORT, useValue: exchangeService },
 ],
 }).compile();

 useCase = module.get(ExportReconciliationReportUseCase);
 reconcileUseCase = module.get(ReconcileBalanceUseCase);
 });

 mockFs();

 it('writes report file with summary of reconciliation results', async () => {
 walletRepo.findWalletPairs.mockResolvedValue([
 { userId: 'uid-1', currencyId: 'cid-1' },
 { userId: 'uid-2', currencyId: 'cid-1' },
 ]);

 walletRepo.findByUserCurrency
 .mockResolvedValueOnce({ wallet_id: 'w1', available: '100', frozen: '0' })
 .mockResolvedValueOnce({ wallet_id: 'w2', available: '200', frozen: '0' });

 exchangeService.getBalance
 .mockResolvedValueOnce({ available: '100', frozen: '0' })
 .mockResolvedValueOnce({ available: '250', frozen: '0' });

 const writeSpy = jest.spyOn(fs, 'writeFile').mockResolvedValue(undefined);

 const result = await useCase.execute('admin-uid', 10);

 expect(result.summary.checked).toBe(2);
 expect(result.summary.balanced).toBe(1); // uid-1: internal=100, external=100 → balanced
 expect(result.summary.discrepancyDetected).toBe(1); // uid-2: internal=200, external=250
 expect(result.summary.failed).toBe(0);
 expect(writeSpy).toHaveBeenCalled();
 const writtenContent = writeSpy.mock.calls[0][1] as string;
 const report = JSON.parse(writtenContent);
 expect(report).toHaveLength(1);
 expect(report[0].summary.actorUserId).toBe('admin-uid');
 });

 it('caps limit to 1000', async () => {
 walletRepo.findWalletPairs.mockResolvedValue([]);
 const writeSpy = jest.spyOn(fs, 'writeFile').mockResolvedValue(undefined);

 await useCase.execute('admin-uid', 5000);

 expect(walletRepo.findWalletPairs).toHaveBeenCalledWith(1000);
 });

 it('marks items as FAILED when reconciliation throws', async () => {
 walletRepo.findWalletPairs.mockResolvedValue([{ userId: 'uid-1', currencyId: 'cid-1' }]);
 walletRepo.findByUserCurrency.mockResolvedValue(null);

 const writeSpy = jest.spyOn(fs, 'writeFile').mockResolvedValue(undefined);

 const result = await useCase.execute('admin-uid', 10);

 expect(result.summary.failed).toBe(1);
 expect(result.summary.checked).toBe(1);
 expect(writeSpy).toHaveBeenCalled();
 });
});
