import { MarketReadModelReconciliationService } from './market-read-model-reconciliation.service';

describe('MarketReadModelReconciliationService', () => {
  it('compares core trades with read model trades', async () => {
    const service = new MarketReadModelReconciliationService({
      query: jest.fn().mockResolvedValue([{ trade_id: 'trade-1' }, { trade_id: 'trade-2' }]),
      getRepository: jest.fn(() => ({
        createQueryBuilder: jest.fn(() => ({
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          getMany: jest.fn().mockResolvedValue([{ trade_id: 'trade-1' }]),
        })),
        find: jest.fn().mockResolvedValue([]),
      })),
    } as never);

    const report = await service.reconcileTrades(24);

    expect(report).toEqual({
      coreCount: 2,
      readModelCount: 1,
      missingTrades: ['trade-2'],
      drift: 1,
      windowHours: 24,
    });
  });

  it('compares ticker projection freshness against core trades', async () => {
    const service = new MarketReadModelReconciliationService({
      query: jest.fn().mockResolvedValue([
        { pair_id: 'pair-1', last_trade_at: '2026-04-25T10:10:00.000Z' },
        { pair_id: 'pair-2', last_trade_at: '2026-04-25T10:10:00.000Z' },
      ]),
      getRepository: jest.fn(() => ({
        createQueryBuilder: jest.fn(() => ({
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          getMany: jest.fn().mockResolvedValue([]),
        })),
        find: jest.fn().mockResolvedValue([
          { pair_id: 'pair-1', ticker_timestamp: new Date('2026-04-25T10:09:30.000Z') },
        ]),
      })),
    } as never);

    const report = await service.reconcileTickers(24);

    expect(report).toEqual({
      corePairs: 2,
      readModelPairs: 1,
      missingPairs: ['pair-2'],
      stalePairs: [],
      drift: 1,
      windowHours: 24,
    });
  });

  it('reconciles OHLCV projection against derived core candles', async () => {
    const service = new MarketReadModelReconciliationService({
      query: jest.fn().mockResolvedValue([
        {
          pair_id: 'pair-1',
          open_time: '2026-04-25T10:00:00.000Z',
          last_trade_at: '2026-04-25T10:00:20.000Z',
        },
        {
          pair_id: 'pair-2',
          open_time: '2026-04-25T10:01:00.000Z',
          last_trade_at: '2026-04-25T10:01:10.000Z',
        },
      ]),
      getRepository: jest.fn(() => ({
        createQueryBuilder: jest.fn(() => ({
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          getMany: jest.fn().mockResolvedValue([
            {
              pair_id: 'pair-1',
              open_time: new Date('2026-04-25T10:00:00.000Z'),
              last_trade_id: 'trade-1',
            },
          ]),
        })),
        find: jest.fn().mockResolvedValue([]),
      })),
    } as never);

    const report = await service.reconcileOhlcv(24, 60);

    expect(report).toEqual({
      intervalSec: 60,
      windowHours: 24,
      coreCandles: 2,
      readModelCandles: 1,
      missingCandles: ['pair-2:2026-04-25T10:01:00.000Z'],
      staleCandles: [],
      drift: 1,
    });
  });

  it('reconciles multiple OHLCV intervals', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([
        {
          pair_id: 'pair-1',
          open_time: '2026-04-25T10:00:00.000Z',
          last_trade_at: '2026-04-25T10:00:20.000Z',
        },
      ])
      .mockResolvedValueOnce([
        {
          pair_id: 'pair-1',
          open_time: '2026-04-25T10:00:00.000Z',
          last_trade_at: '2026-04-25T10:04:50.000Z',
        },
      ]);

    const getMany = jest
      .fn()
      .mockResolvedValueOnce([
        {
          pair_id: 'pair-1',
          open_time: new Date('2026-04-25T10:00:00.000Z'),
          last_trade_id: 'trade-1',
        },
      ])
      .mockResolvedValueOnce([
        {
          pair_id: 'pair-1',
          open_time: new Date('2026-04-25T10:00:00.000Z'),
          last_trade_id: 'trade-2',
        },
      ]);

    const service = new MarketReadModelReconciliationService({
      query,
      getRepository: jest.fn(() => ({
        createQueryBuilder: jest.fn(() => ({
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          getMany,
        })),
        find: jest.fn().mockResolvedValue([]),
      })),
    } as never);

    const reports = await service.reconcileOhlcvIntervals(24, [60, 300]);

    expect(reports).toHaveLength(2);
    expect(reports.map((report) => report.intervalSec)).toEqual([60, 300]);
  });

  it('builds projection health summary with lag details', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ trade_id: 'trade-1' }])
      .mockResolvedValueOnce([{ pair_id: 'pair-1', last_trade_at: '2026-04-25T10:10:00.000Z' }])
      .mockResolvedValueOnce([
        {
          pair_id: 'pair-1',
          open_time: '2026-04-25T10:10:00.000Z',
          last_trade_at: '2026-04-25T10:10:20.000Z',
        },
      ])
      .mockResolvedValueOnce([
        {
          pair_id: 'pair-1',
          open_time: '2026-04-25T10:10:00.000Z',
          last_trade_at: '2026-04-25T10:14:20.000Z',
        },
      ])
      .mockResolvedValueOnce([{ latest_core_at: '2026-04-25T10:10:30.000Z' }])
      .mockResolvedValueOnce([{ latest_projection_at: '2026-04-25T10:10:10.000Z' }])
      .mockResolvedValueOnce([{ latest_core_at: '2026-04-25T10:10:30.000Z' }])
      .mockResolvedValueOnce([{ latest_projection_at: '2026-04-25T10:10:20.000Z' }])
      .mockResolvedValueOnce([{ latest_core_at: '2026-04-25T10:10:30.000Z' }])
      .mockResolvedValueOnce([{ latest_projection_at: '2026-04-25T10:10:00.000Z' }]);

    const getMany = jest
      .fn()
      .mockResolvedValueOnce([{ trade_id: 'trade-1' }])
      .mockResolvedValueOnce([
        {
          pair_id: 'pair-1',
          open_time: new Date('2026-04-25T10:10:00.000Z'),
          last_trade_id: 'trade-1',
        },
      ])
      .mockResolvedValueOnce([
        {
          pair_id: 'pair-1',
          open_time: new Date('2026-04-25T10:10:00.000Z'),
          last_trade_id: 'trade-2',
        },
      ]);

    const service = new MarketReadModelReconciliationService({
      query,
      getRepository: jest.fn((entity) => ({
        createQueryBuilder: jest.fn(() => ({
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          getMany,
        })),
        find: jest.fn().mockResolvedValue(
          entity?.name === 'ReadMarketTicker'
            ? [{ pair_id: 'pair-1', ticker_timestamp: new Date('2026-04-25T10:10:20.000Z') }]
            : [],
        ),
      })),
    } as never);

    const report = await service.getProjectionHealth(24, [60, 300]);

    expect(report.status).toBe('up');
    expect(report.ohlcv).toHaveLength(2);
    expect(report.ohlcv.map((item) => item.intervalSec)).toEqual([60, 300]);
    expect(report.lag.trades.lagSeconds).toBe(20);
    expect(report.lag.tickers.lagSeconds).toBe(10);
    expect(report.lag.ohlcv.lagSeconds).toBe(30);
  });
});
