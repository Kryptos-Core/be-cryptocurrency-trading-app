import { Test, type TestingModule } from '@nestjs/testing';
import { OrdersController } from '@/modules/orders/orders.controller';
import { OrdersService } from '@/modules/orders/orders.service';
import { FindMyOrdersQuery } from '@/modules/orders/application/queries/find-my-orders.query';
import { ReconcileMatchingForPairUseCase } from '@/modules/orders/application/use-cases/reconcile-matching-for-pair.use-case';
import { MarketsController } from '@/modules/markets/markets.controller';
import {
  GetMarketDepthQuery,
  GetMarketOHLCVQuery,
  GetMarketPairQuery,
  GetMarketTickerQuery,
} from '@/modules/markets/application/queries';
import {
  CreateMarketPairUseCase,
  DeleteMarketPairUseCase,
  UpdateMarketPairUseCase,
} from '@/modules/markets/application/use-cases';
import { MarketReadModelReconciliationService } from '@/modules/markets/market-read-model-reconciliation.service';

describe('API contract baseline snapshots', () => {
  it('locks markets ticker/trades response shape', async () => {
    const tickerQuery = {
      getAllTickers: jest.fn(),
      getTicker: jest.fn().mockResolvedValue({
        pair_id: 'pair-1',
        symbol: 'BTC/USDT',
        last_price: '100000',
        bid: '99990',
        ask: '100010',
        volume_24h: '12.34',
        volume_24h_usd: '1234000',
        change_24h: '500',
        change_percent_24h: '0.5',
        high_24h: '101000',
        low_24h: '98000',
        open_24h: '99500',
        timestamp: '2026-04-26T00:00:00.000Z',
      }),
      getTickerBySymbol: jest.fn(),
    };
    const depthQuery = {
      getOrderBook: jest.fn(),
      getOrderBookBySymbol: jest.fn(),
      getRecentTrades: jest.fn().mockResolvedValue([
        {
          trade_id: 'trade-1',
          pair_id: 'pair-1',
          symbol: 'BTC/USDT',
          side: 'BUY',
          price: '100000',
          amount: '0.01000000',
          executed_at: '2026-04-26T00:00:01.000Z',
        },
      ]),
      getRecentTradesBySymbol: jest.fn(),
      getDepthSnapshot: jest.fn(),
      getDepthSnapshotBySymbol: jest.fn(),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [MarketsController],
      providers: [
        {
          provide: GetMarketPairQuery,
          useValue: { findAll: jest.fn(), findOne: jest.fn(), findBySymbol: jest.fn(), findActive: jest.fn() },
        },
        { provide: GetMarketTickerQuery, useValue: tickerQuery },
        { provide: GetMarketDepthQuery, useValue: depthQuery },
        { provide: GetMarketOHLCVQuery, useValue: { getOHLCV: jest.fn() } },
        { provide: CreateMarketPairUseCase, useValue: { execute: jest.fn() } },
        { provide: UpdateMarketPairUseCase, useValue: { execute: jest.fn() } },
        { provide: DeleteMarketPairUseCase, useValue: { execute: jest.fn() } },
        {
          provide: MarketReadModelReconciliationService,
          useValue: { getProjectionHealth: jest.fn(), collectMetrics: jest.fn() },
        },
      ],
    }).compile();

    const controller = moduleRef.get(MarketsController);
    const ticker = await controller.getTicker('pair-1');
    const trades = await controller.getRecentTrades('pair-1', 50);

    expect({ ticker, trades }).toMatchSnapshot();
  });

  it('locks orders create/cancel/my-orders response shape', async () => {
    const service = {
      create: jest.fn().mockResolvedValue({
        order_id: 'order-1',
        user_id: 'user-1',
        pair_id: 'pair-1',
        side: 'BUY',
        type: 'LIMIT',
        price: '50000',
        amount: '0.01',
        filled_amount: '0',
        status: 'OPEN',
        time_in_force: 'GTC',
        reserved_quote: '500',
        reserved_base: '0',
        idempotency_key: 'idempotent-1',
        created_at: '2026-04-26T00:00:00.000Z',
        updated_at: '2026-04-26T00:00:00.000Z',
      }),
      createBatch: jest.fn(),
      findAllForAdmin: jest.fn(),
      getOrderBook: jest.fn(),
      findOne: jest.fn(),
      cancel: jest.fn().mockResolvedValue({
        order_id: 'order-1',
        status: 'CANCELLED',
        updated_at: '2026-04-26T00:10:00.000Z',
      }),
      cancelBatch: jest.fn(),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [OrdersController],
      providers: [
        { provide: OrdersService, useValue: service },
        {
          provide: FindMyOrdersQuery,
          useValue: {
            execute: jest.fn().mockResolvedValue({
              data: [
                {
                  order_id: 'order-1',
                  pair_id: 'pair-1',
                  status: 'OPEN',
                  price: '50000',
                  amount: '0.01',
                  filled_amount: '0',
                },
              ],
              total: 1,
              page: 1,
              limit: 20,
            }),
          },
        },
        {
          provide: ReconcileMatchingForPairUseCase,
          useValue: { execute: jest.fn(), shadowParity: jest.fn() },
        },
      ],
    }).compile();

    const controller = moduleRef.get(OrdersController);
    const created = await controller.create('user-1', {
      pairId: 'pair-1',
      side: 'BUY',
      type: 'LIMIT',
      price: '50000',
      amount: '0.01',
      idempotencyKey: 'idempotent-1',
    });
    const cancelled = await controller.cancel('user-1', 'order-1', {});
    const myOrders = await controller.findMyOrders('user-1', 1, 20, 'OPEN');

    expect({ created, cancelled, myOrders }).toMatchSnapshot();
  });
});
