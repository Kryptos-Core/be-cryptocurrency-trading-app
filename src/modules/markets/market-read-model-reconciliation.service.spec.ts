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
        find: jest
          .fn()
          .mockResolvedValue([
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
        find: jest
          .fn()
          .mockResolvedValue(
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

  it('publishes alert severity metric from reconciliation health', async () => {
    const metricsService = {
      setMarketReadModelTradeDrift: jest.fn(),
      setMarketReadModelTickerDrift: jest.fn(),
      setMarketReadModelTickerStalePairs: jest.fn(),
      setMarketReadModelOhlcvDrift: jest.fn(),
      setMarketReadModelProjectionLagSeconds: jest.fn(),
      setMarketReadModelAlertSeverity: jest.fn(),
    };

    const configService = {
      get: jest.fn((key: string) => {
        if (key === 'MARKET_READ_MODEL_ALERT_MAX_LAG_SECONDS') return '300';
        if (key === 'MARKET_READ_MODEL_ALERT_CRITICAL_MAX_LAG_SECONDS') return '900';
        return undefined;
      }),
    };

    const service = new MarketReadModelReconciliationService(
      {
        query: jest.fn().mockResolvedValue([]),
        getRepository: jest.fn(() => ({
          createQueryBuilder: jest.fn(() => ({
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockReturnThis(),
            getMany: jest.fn().mockResolvedValue([]),
          })),
          find: jest.fn().mockResolvedValue([]),
        })),
      } as never,
      metricsService as never,
      configService as never,
    );

    jest.spyOn(service, 'getProjectionHealth').mockResolvedValue({
      status: 'up',
      checkedAt: '2026-04-26T00:00:00.000Z',
      windowHours: 24,
      trades: { coreCount: 0, readModelCount: 0, missingTrades: [], drift: 0, windowHours: 24 },
      tickers: {
        corePairs: 0,
        readModelPairs: 0,
        missingPairs: [],
        stalePairs: [],
        drift: 0,
        windowHours: 24,
      },
      ohlcv: [
        {
          intervalSec: 60,
          windowHours: 24,
          coreCandles: 0,
          readModelCandles: 0,
          missingCandles: [],
          staleCandles: [],
          drift: 0,
        },
      ],
      lag: {
        trades: {
          projection: 'trades',
          lagSeconds: 120,
          latestCoreAt: null,
          latestProjectionAt: null,
        },
        tickers: {
          projection: 'tickers',
          lagSeconds: 80,
          latestCoreAt: null,
          latestProjectionAt: null,
        },
        ohlcv: {
          projection: 'ohlcv',
          lagSeconds: 45,
          latestCoreAt: null,
          latestProjectionAt: null,
        },
      },
    });

    await service.collectMetrics(24, [60]);

    expect(metricsService.setMarketReadModelAlertSeverity).toHaveBeenCalledWith(0);

    (service.getProjectionHealth as jest.Mock).mockResolvedValue({
      status: 'degraded',
      checkedAt: '2026-04-26T00:00:00.000Z',
      windowHours: 24,
      trades: {
        coreCount: 1,
        readModelCount: 0,
        missingTrades: ['trade-1'],
        drift: 1,
        windowHours: 24,
      },
      tickers: {
        corePairs: 1,
        readModelPairs: 0,
        missingPairs: ['pair-1'],
        stalePairs: [],
        drift: 1,
        windowHours: 24,
      },
      ohlcv: [
        {
          intervalSec: 60,
          windowHours: 24,
          coreCandles: 1,
          readModelCandles: 0,
          missingCandles: ['pair-1:2026-04-26T00:00:00.000Z'],
          staleCandles: [],
          drift: 1,
        },
      ],
      lag: {
        trades: {
          projection: 'trades',
          lagSeconds: 980,
          latestCoreAt: null,
          latestProjectionAt: null,
        },
        tickers: {
          projection: 'tickers',
          lagSeconds: 20,
          latestCoreAt: null,
          latestProjectionAt: null,
        },
        ohlcv: {
          projection: 'ohlcv',
          lagSeconds: 15,
          latestCoreAt: null,
          latestProjectionAt: null,
        },
      },
    });

    await service.collectMetrics(24, [60]);

    expect(metricsService.setMarketReadModelAlertSeverity).toHaveBeenLastCalledWith(2);
  });
});
