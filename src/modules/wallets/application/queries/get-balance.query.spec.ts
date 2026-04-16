import { Test } from '@nestjs/testing';
import { WALLET_REPOSITORY } from '@/modules/wallets/domain/ports';
import { BalanceCalculationService } from '@/modules/wallets/domain/services/balance-calculation.service';
import { GetBalanceQuery } from './get-balance.query';

function makeWallet(available: string, frozen: string) {
 return { wallet_id: 'wid-1', available, frozen };
}

describe('GetBalanceQuery', () => {
 let query: GetBalanceQuery;

 let walletRepo: jest.Mocked<{ findByUserCurrency: jest.Mock }>;

 beforeEach(async () => {
 walletRepo = { findByUserCurrency: jest.fn() };

 const module = await Test.createTestingModule({
 providers: [
 GetBalanceQuery,
 BalanceCalculationService,
 { provide: WALLET_REPOSITORY, useValue: walletRepo },
 ],
 }).compile();

 query = module.get(GetBalanceQuery);
 });

 it('returns wallet snapshot when wallet exists', async () => {
 walletRepo.findByUserCurrency.mockResolvedValue(makeWallet('300', '50'));

 const result = await query.execute('uid-1', 'cid-1');

 expect(result).toEqual({
 userId: 'uid-1',
 currencyId: 'cid-1',
 available: '300',
 frozen: '50',
 total: '350',
 });
 });

 it('returns zero snapshot when wallet not found', async () => {
 walletRepo.findByUserCurrency.mockResolvedValue(null);

 const result = await query.execute('uid-1', 'cid-1');

 expect(result).toEqual({
 userId: 'uid-1',
 currencyId: 'cid-1',
 available: '0',
 frozen: '0',
 total: '0',
 });
 });

 it('defaults null fields to 0 in snapshot', async () => {
 walletRepo.findByUserCurrency.mockResolvedValue({ wallet_id: 'wid-1' } as any);

 const result = await query.execute('uid-1', 'cid-1');

 expect(result.available).toBe('0');
 expect(result.frozen).toBe('0');
 expect(result.total).toBe('0');
 });
});
