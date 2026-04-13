import { Test, type TestingModule } from '@nestjs/testing';
import { RedisService } from '@/common/services/redis.service';
import { CurrencyRepository } from '@/modules/currencies/repositories';
import { CoinGeckoProvider } from './coingecko.provider';

describe('CoinGeckoProvider', () => {
  let provider: CoinGeckoProvider;
  let redisService: jest.Mocked<RedisService>;
  let currencyRepository: jest.Mocked<CurrencyRepository>;

  beforeEach(async () => {
    redisService = {
      get: jest.fn(),
      set: jest.fn(),
    } as unknown as jest.Mocked<RedisService>;

    currencyRepository = {
      findActive: jest.fn(),
    } as unknown as jest.Mocked<CurrencyRepository>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CoinGeckoProvider,
        { provide: RedisService, useValue: redisService },
        { provide: CurrencyRepository, useValue: currencyRepository },
      ],
    }).compile();

    provider = module.get(CoinGeckoProvider);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns cached market prices when present', async () => {
    redisService.get.mockResolvedValue(
      JSON.stringify({
        prices: [{ symbol: 'BTC', priceUsd: '63500', priceVnd: '1590000000' }],
        updatedAt: '2026-04-14T10:00:00.000Z',
      }),
    );
    currencyRepository.findActive.mockResolvedValue([
      { symbol: 'BTC', is_active: true },
    ] as any);

    const result = await provider.getMarketPrices();

    expect(result.prices).toHaveLength(1);
    expect(redisService.set).not.toHaveBeenCalled();
  });

  it('fetches from api and caches normalized symbols when cache misses', async () => {
    redisService.get.mockResolvedValue(null);
    currencyRepository.findActive.mockResolvedValue([
      { symbol: 'BTC', is_active: true },
      { symbol: 'ETH', is_active: true },
      { symbol: 'DOGE', is_active: true },
    ] as any);

    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        bitcoin: { usd: 63500, vnd: 1590000000 },
        ethereum: { usd: 3200, vnd: 80000000 },
      }),
    } as Response);

    const result = await provider.getMarketPrices();

    expect(result.prices).toEqual([
      { symbol: 'BTC', priceUsd: '63500', priceVnd: '1590000000' },
      { symbol: 'ETH', priceUsd: '3200', priceVnd: '80000000' },
    ]);
    expect(redisService.set).toHaveBeenCalled();
  });

  it('refetches when cache does not cover requested symbols', async () => {
    redisService.get.mockResolvedValue(
      JSON.stringify({
        prices: [{ symbol: 'USDT', priceUsd: '1', priceVnd: '25100' }],
        updatedAt: '2026-04-14T10:00:00.000Z',
      }),
    );

    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        bitcoin: { usd: 63500, vnd: 1590000000 },
      }),
    } as Response);

    const result = await provider.getMarketPrices(['BTC']);

    expect(result.prices).toEqual([
      { symbol: 'BTC', priceUsd: '63500', priceVnd: '1590000000' },
    ]);
    expect(redisService.set).toHaveBeenCalled();
  });
});
