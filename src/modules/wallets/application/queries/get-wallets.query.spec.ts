import { Test } from '@nestjs/testing';
import { CURRENCY_REPOSITORY } from '@/modules/currencies/domain/ports';
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
  let currencyRepo: jest.Mocked<{ findTradable: jest.Mock }>;

  beforeEach(async () => {
    walletRepo = { findByUser: jest.fn() };
    currencyRepo = { findTradable: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        GetWalletsQuery,
        { provide: WALLET_REPOSITORY, useValue: walletRepo },
        { provide: CURRENCY_REPOSITORY, useValue: currencyRepo },
      ],
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
    expect(currencyRepo.findTradable).not.toHaveBeenCalled();
  });

  it('fills synthetic zero rows from tradable currencies when DB wallets empty and includeZero true', async () => {
    walletRepo.findByUser.mockResolvedValue([]);
    currencyRepo.findTradable.mockResolvedValue([
      {
        currency_id: '018f0000-0000-7000-a000-000000000001',
        symbol: 'BTC',
        name: 'Bitcoin',
      } as any,
    ]);

    const result = await query.execute('uid-1', true);

    expect(currencyRepo.findTradable).toHaveBeenCalled();
    expect(result).toHaveLength(1);
    expect(result[0].symbol).toBe('BTC');
    expect(result[0].available).toBe('0');
    expect(result[0].total).toBe('0');
  });

  it('defaults null fields to 0 in total calculation', async () => {
    walletRepo.findByUser.mockResolvedValue([
      makeRow({ available: null as any, frozen: null as any }),
    ]);

    const result = await query.execute('uid-1');

    expect(result[0].total).toBe('0');
  });
});
