import { Test } from '@nestjs/testing';
import { WalletReferenceType } from '@/common/enums';
import { WALLET_LEDGER_REPOSITORY } from '@/modules/wallets/domain/ports';
import { GetTransactionHistoryQuery } from './get-transaction-history.query';

function makeEntry(overrides: Partial<{ ref_type: string; ref_id: number; direction: string; amount: string; created_at: Date }> = {}) {
 return {
 ref_type: WalletReferenceType.DEPOSIT,
 ref_id: 1,
 direction: 'CREDIT',
 amount: '100',
 created_at: new Date('2024-01-01T00:00:00Z'),
 ...overrides,
 };
}

describe('GetTransactionHistoryQuery', () => {
 let query: GetTransactionHistoryQuery;

 let ledgerRepo: jest.Mocked<{ findRecentByUserAndCurrency: jest.Mock }>;

 beforeEach(async () => {
 ledgerRepo = { findRecentByUserAndCurrency: jest.fn() };

 const module = await Test.createTestingModule({
 providers: [
 GetTransactionHistoryQuery,
 { provide: WALLET_LEDGER_REPOSITORY, useValue: ledgerRepo },
 ],
 }).compile();

 query = module.get(GetTransactionHistoryQuery);
 });

 it('returns transaction history with canonical direction', async () => {
 ledgerRepo.findRecentByUserAndCurrency.mockResolvedValue([
 makeEntry({ ref_type: WalletReferenceType.DEPOSIT, ref_id: 1, direction: 'CREDIT' }),
 makeEntry({ ref_type: WalletReferenceType.WITHDRAW, ref_id: 2, direction: 'DEBIT' }),
 ]);

 const result = await query.execute('uid-1', 'cid-1', 100);

 expect(result).toHaveLength(2);
  expect(result[0].direction).toBe('CREDIT');
 expect(result[1].direction).toBe('DEBIT');
 });

 it('skips duplicate ref_type:ref_id entries', async () => {
 ledgerRepo.findRecentByUserAndCurrency.mockResolvedValue([
 makeEntry({ ref_type: WalletReferenceType.DEPOSIT, ref_id: 1, direction: 'CREDIT' }),
 makeEntry({ ref_type: WalletReferenceType.DEPOSIT, ref_id: 1, direction: 'CREDIT' }), // duplicate
 ]);

 const result = await query.execute('uid-1', 'cid-1', 100);

 expect(result).toHaveLength(1);
 });

 it('skips entries where direction does not match canonical expectation', async () => {
 ledgerRepo.findRecentByUserAndCurrency.mockResolvedValue([
 makeEntry({ ref_type: WalletReferenceType.DEPOSIT, ref_id: 1, direction: 'DEBIT' }), // wrong direction for DEPOSIT
 ]);

 const result = await query.execute('uid-1', 'cid-1', 100);

 expect(result).toHaveLength(0);
 });

 it('passes limit to repository', async () => {
 ledgerRepo.findRecentByUserAndCurrency.mockResolvedValue([]);

 await query.execute('uid-1', 'cid-1', 25);

 expect(ledgerRepo.findRecentByUserAndCurrency).toHaveBeenCalledWith('uid-1', 'cid-1', 25);
 });

 it('returns empty array when no entries found', async () => {
 ledgerRepo.findRecentByUserAndCurrency.mockResolvedValue([]);

 const result = await query.execute('uid-1', 'cid-1');

 expect(result).toEqual([]);
 });
});
