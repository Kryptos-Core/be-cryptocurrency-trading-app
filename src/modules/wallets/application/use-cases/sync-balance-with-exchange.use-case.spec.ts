import { Test } from '@nestjs/testing';
import { BadRequestException, BusinessException } from '@/common/exceptions';
import { EXCHANGE_SERVICE_PORT, WALLET_REPOSITORY } from '@/modules/wallets/domain/ports';
import { BalanceCalculationService } from '@/modules/wallets/domain/services/balance-calculation.service';
import { SyncBalanceWithExchangeUseCase } from './sync-balance-with-exchange.use-case';

function makeWallet(available: string, frozen: string) {
 return { wallet_id: 'wid-1', available, frozen };
}

describe('SyncBalanceWithExchangeUseCase', () => {
  let useCase: SyncBalanceWithExchangeUseCase;

 let walletRepo: jest.Mocked<{ findByUserCurrency: jest.Mock }>;
 let exchangeService: jest.Mocked<{ getBalance: jest.Mock }>;

 beforeEach(async () => {
 walletRepo = { findByUserCurrency: jest.fn() };
 exchangeService = { getBalance: jest.fn() };

 const module = await Test.createTestingModule({
 providers: [
 SyncBalanceWithExchangeUseCase,
 BalanceCalculationService,
  { provide: WALLET_REPOSITORY, useValue: walletRepo },
 { provide: EXCHANGE_SERVICE_PORT, useValue: exchangeService },
 ],
 }).compile();

 useCase = module.get(SyncBalanceWithExchangeUseCase);
 });

 it('returns wallet snapshot with exchange balance when found', async () => {
 walletRepo.findByUserCurrency.mockResolvedValue(makeWallet('100', '50'));
 exchangeService.getBalance.mockResolvedValue({ available: '500', frozen: '25' });

 const result = await useCase.execute('uid-1', 'cid-1');

 expect(result).toEqual({
 userId: 'uid-1',
 currencyId: 'cid-1',
 available: '500',
 frozen: '25',
 total: '525',
 });
 });

 it('throws BadRequestException when wallet not found', async () => {
 walletRepo.findByUserCurrency.mockResolvedValue(null);

 await expect(useCase.execute('uid-1', 'cid-1')).rejects.toBeInstanceOf(BadRequestException);
 });

 it('throws BusinessException when exchange service fails', async () => {
  walletRepo.findByUserCurrency.mockResolvedValue(makeWallet('100', '50'));
 exchangeService.getBalance.mockRejectedValue(new Error('Binance API timeout'));

 await expect(useCase.execute('uid-1', 'cid-1')).rejects.toBeInstanceOf(BusinessException);
 });

 it('defaults missing exchange balance fields to 0', async () => {
 walletRepo.findByUserCurrency.mockResolvedValue(makeWallet('100', '50'));
 exchangeService.getBalance.mockResolvedValue({ available: '200' } as any);

 const result = await useCase.execute('uid-1', 'cid-1');

 expect(result.available).toBe('200');
 expect(result.frozen).toBe('0');
 });
});
