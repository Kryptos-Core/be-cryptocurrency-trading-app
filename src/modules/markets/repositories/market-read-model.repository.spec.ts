import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { MARKET_TS_DB } from '@/config';
import { MarketReadModelRepository } from './market-read-model.repository';

describe('MarketReadModelRepository', () => {
  it('reads recent trades from MARKET_TS_DB', async () => {
    const find = jest.fn().mockResolvedValue([
      {
        trade_id: 'trade-1',
        pair_id: 'pair-1',
        price: '100',
        amount: '0.1',
        executed_at: new Date('2026-04-25T10:00:00.000Z'),
      },
    ]);

    const moduleRef = await Test.createTestingModule({
      providers: [
        MarketReadModelRepository,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(
              (key: string) =>
                ({ MARKET_READ_SOURCE: 'timescale', MARKET_TS_ENABLED: 'true' })[key],
            ),
          },
        },
        {
          provide: MARKET_TS_DB,
          useValue: { getRepository: jest.fn(() => ({ find })) },
        },
      ],
    }).compile();

    const repo = moduleRef.get(MarketReadModelRepository);
    const result = await repo.getRecentTrades('pair-1', 10);

    expect(result).toEqual([
      {
        trade_id: 'trade-1',
        pair_id: 'pair-1',
        price: '100',
        amount: '0.1',
        side: 'BUY',
        created_at: new Date('2026-04-25T10:00:00.000Z'),
      },
    ]);
    expect(repo.shouldUseReadModel()).toBe(true);
  });

  it('reads ticker projection from MARKET_TS_DB', async () => {
    const findOne = jest.fn().mockResolvedValue({
      pair_id: 'pair-1',
      symbol: 'BTC/USDT',
      last_price: '65000',
      high_24h: '66000',
      low_24h: '64000',
      volume_24h: '100',
      volume_24h_usd: '6500000',
      change_percent_24h: '1.56',
      change_24h: '1000',
      best_bid: '64999',
      best_ask: '65001',
      open_24h: '64000',
      ticker_timestamp: new Date('2026-04-25T10:00:00.000Z'),
    });

    const moduleRef = await Test.createTestingModule({
      providers: [
        MarketReadModelRepository,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(
              (key: string) =>
                ({ MARKET_READ_SOURCE: 'timescale', MARKET_TS_ENABLED: 'true' })[key],
            ),
          },
        },
        {
          provide: MARKET_TS_DB,
          useValue: { getRepository: jest.fn(() => ({ findOne, find: jest.fn() })) },
        },
      ],
    }).compile();

    const repo = moduleRef.get(MarketReadModelRepository);
    const result = await repo.getTicker('pair-1');

    expect(result).toEqual({
      symbol: 'BTC/USDT',
      pairId: 'pair-1',
      lastPrice: '65000',
      high24h: '66000',
      low24h: '64000',
      volume24h: '100',
      quoteVolume24h: '6500000',
      change24h: '1.56',
      changeAmount24h: '1000',
      bestBid: '64999',
      bestAsk: '65001',
      open24h: '64000',
      timestamp: '2026-04-25T10:00:00.000Z',
    });
  });

  it('resolves pair id by symbol from ticker projection', async () => {
    const findOne = jest.fn().mockResolvedValue({ pair_id: 'pair-1', symbol: 'BTC/USDT' });

    const moduleRef = await Test.createTestingModule({
      providers: [
        MarketReadModelRepository,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(
              (key: string) =>
                ({ MARKET_READ_SOURCE: 'timescale', MARKET_TS_ENABLED: 'true' })[key],
            ),
          },
        },
        {
          provide: MARKET_TS_DB,
          useValue: { getRepository: jest.fn(() => ({ findOne, find: jest.fn() })) },
        },
      ],
    }).compile();

    const repo = moduleRef.get(MarketReadModelRepository);
    const result = await repo.resolvePairIdBySymbol('BTC/USDT');
    expect(result).toBe('pair-1');
  });

  it('reads OHLCV projection from MARKET_TS_DB', async () => {
    const find = jest.fn().mockResolvedValue([
      {
        pair_id: 'pair-1',
        interval_sec: 60,
        open_time: new Date('2026-04-25T10:00:00.000Z'),
        open: '100',
        high: '110',
        low: '90',
        close: '105',
        volume: '1.5',
        quote_volume: '157.5',
        trades_count: 3,
      },
    ]);

    const moduleRef = await Test.createTestingModule({
      providers: [
        MarketReadModelRepository,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(
              (key: string) =>
                ({ MARKET_READ_SOURCE: 'timescale', MARKET_TS_ENABLED: 'true' })[key],
            ),
          },
        },
        {
          provide: MARKET_TS_DB,
          useValue: { getRepository: jest.fn(() => ({ find, findOne: jest.fn() })) },
        },
      ],
    }).compile();

    const repo = moduleRef.get(MarketReadModelRepository);
    const result = await repo.getOhlcv('pair-1', 60, 100);

    expect(result).toEqual([
      {
        pair_id: 'pair-1',
        interval_sec: 60,
        open_time: new Date('2026-04-25T10:00:00.000Z'),
        open: '100',
        high: '110',
        low: '90',
        close: '105',
        volume: '1.5',
        quote_volume: '157.5',
        trades_count: 3,
      },
    ]);
  });
});
