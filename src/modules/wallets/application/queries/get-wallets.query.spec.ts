import { Test } from '@nestjs/testing';
import { WALLET_REPOSITORY } from '@/modules/wallets/domain/ports';
import { GetWalletsQuery } from './get-wallets.query';

function makeRow(
  overrides: Partial<{
    wallet_id: string;
    currency_id: string;
    available: string;
    frozen: string;
    currency_symbol: string;
    currency_name: string;
  }> = {},
) {
  return {
    wallet_id: 'wid-1',
    currency_id: 'cid-1',
    available: '100',
    frozen: '50',
    currency_symbol: 'BTC',
    currency_name: 'Bitcoin',
    ...overrides,
  };
}

describe('GetWalletsQuery', () => {
  let query: GetWalletsQuery;

  let walletRepo: jest.Mocked<{ findByUser: jest.Mock }>;

  beforeEach(async () => {
    walletRepo = { findByUser: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [GetWalletsQuery, { provide: WALLET_REPOSITORY, useValue: walletRepo }],
    }).compile();

    query = module.get(GetWalletsQuery);
  });

  it('maps wallet rows to WalletListItemDto', async () => {
    walletRepo.findByUser.mockResolvedValue([
      makeRow(),
      makeRow({
        wallet_id: 'wid-2',
        currency_id: 'cid-2',
        available: '200',
        frozen: '0',
        currency_symbol: 'ETH',
        currency_name: 'Ethereum',
      }),
    ]);

    const result = await query.execute('uid-1');

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      walletId: 'wid-1',
      currencyId: 'cid-1',
      symbol: 'BTC',
      name: 'Bitcoin',
      available: '100',
      frozen: '50',
      total: '150',
    });
  });

  it('passes includeZero flag to repository', async () => {
    walletRepo.findByUser.mockResolvedValue([]);

    await query.execute('uid-1', false);

    expect(walletRepo.findByUser).toHaveBeenCalledWith('uid-1', false);
  });

  it('defaults null fields to 0 in total calculation', async () => {
    walletRepo.findByUser.mockResolvedValue([
      makeRow({ available: null as any, frozen: null as any }),
    ]);

    const result = await query.execute('uid-1');

    expect(result[0].total).toBe('0');
  });
});
