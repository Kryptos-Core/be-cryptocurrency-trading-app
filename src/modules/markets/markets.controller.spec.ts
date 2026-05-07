import { Test, type TestingModule } from '@nestjs/testing';
import {
  GetMarketDepthQuery,
  GetMarketOHLCVQuery,
  GetMarketPairQuery,
  GetMarketTickerQuery,
} from './application/queries';
import {
  CreateMarketPairUseCase,
  DeleteMarketPairUseCase,
  UpdateMarketPairUseCase,
} from './application/use-cases';
import { MarketReadModelReconciliationService } from './market-read-model-reconciliation.service';
import { MarketsController } from './markets.controller';

describe('MarketsController', () => {
  let controller: MarketsController;
  let reconciliationService: jest.Mocked<MarketReadModelReconciliationService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MarketsController],
      providers: [
        {
          provide: GetMarketPairQuery,
          useValue: {
            findAll: jest.fn(),
            findOne: jest.fn(),
            findBySymbol: jest.fn(),
            findActive: jest.fn(),
          },
        },
        {
          provide: GetMarketTickerQuery,
          useValue: {
            getAllTickers: jest.fn(),
            getTicker: jest.fn(),
            getTickerBySymbol: jest.fn(),
          },
        },
        {
          provide: GetMarketDepthQuery,
          useValue: {
            getOrderBook: jest.fn(),
            getOrderBookBySymbol: jest.fn(),
            getRecentTrades: jest.fn(),
            getRecentTradesBySymbol: jest.fn(),
            getDepthSnapshot: jest.fn(),
            getDepthSnapshotBySymbol: jest.fn(),
          },
        },
        { provide: GetMarketOHLCVQuery, useValue: { getOHLCV: jest.fn() } },
        { provide: CreateMarketPairUseCase, useValue: { execute: jest.fn() } },
        { provide: UpdateMarketPairUseCase, useValue: { execute: jest.fn() } },
        { provide: DeleteMarketPairUseCase, useValue: { execute: jest.fn() } },
        {
          provide: MarketReadModelReconciliationService,
          useValue: {
            getProjectionHealth: jest.fn(),
            collectMetrics: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get(MarketsController);
    reconciliationService = module.get(MarketReadModelReconciliationService);
  });

  it('returns on-demand read-model reconciliation report', async () => {
    const report = {
      status: 'up',
      checkedAt: '2026-04-25T00:00:00.000Z',
      windowHours: 24,
      trades: { coreCount: 1, readModelCount: 1, missingTrades: [], drift: 0, windowHours: 24 },
      tickers: {
        corePairs: 1,
        readModelPairs: 1,
        missingPairs: [],
        stalePairs: [],
        drift: 0,
        windowHours: 24,
      },
      ohlcv: [
        {
          intervalSec: 60,
          windowHours: 24,
          coreCandles: 1,
          readModelCandles: 1,
          missingCandles: [],
          staleCandles: [],
          drift: 0,
        },
      ],
      lag: {
        trades: {
          projection: 'trades',
          lagSeconds: 0,
          latestCoreAt: null,
          latestProjectionAt: null,
        },
        tickers: {
          projection: 'tickers',
          lagSeconds: 0,
          latestCoreAt: null,
          latestProjectionAt: null,
        },
        ohlcv: { projection: 'ohlcv', lagSeconds: 0, latestCoreAt: null, latestProjectionAt: null },
      },
    };
    reconciliationService.getProjectionHealth.mockResolvedValue(report as never);

    const result = await controller.getReadModelReconciliation(24, '60,300,900');

    expect(reconciliationService.getProjectionHealth).toHaveBeenCalledWith(24, [60, 300, 900]);
    expect(result).toEqual(report);
  });

  it('collects metrics on demand with defaults when no intervals are provided', async () => {
    const report = {
      status: 'degraded',
      checkedAt: '2026-04-25T00:05:00.000Z',
      windowHours: 12,
      trades: {
        coreCount: 10,
        readModelCount: 9,
        missingTrades: ['t-1'],
        drift: 1,
        windowHours: 12,
      },
      tickers: {
        corePairs: 2,
        readModelPairs: 2,
        missingPairs: [],
        stalePairs: ['pair-1'],
        drift: 0,
        windowHours: 12,
      },
      ohlcv: [],
      lag: {
        trades: {
          projection: 'trades',
          lagSeconds: 30,
          latestCoreAt: null,
          latestProjectionAt: null,
        },
        tickers: {
          projection: 'tickers',
          lagSeconds: 25,
          latestCoreAt: null,
          latestProjectionAt: null,
        },
        ohlcv: {
          projection: 'ohlcv',
          lagSeconds: 60,
          latestCoreAt: null,
          latestProjectionAt: null,
        },
      },
    };
    reconciliationService.collectMetrics.mockResolvedValue(report as never);

    const result = await controller.collectReadModelMetrics(12, undefined);

    expect(reconciliationService.collectMetrics).toHaveBeenCalledWith(12, undefined);
    expect(result).toEqual(report);
  });
});
