import { Test, type TestingModule } from '@nestjs/testing';
import { CacheService } from '@/common/services';
import { MarketsService } from '@/modules/markets/markets.service';
import { OrdersService } from '@/modules/orders/orders.service';
import { SystemConfigService } from '@/modules/system-config/system-config.service';
import { MarketMakerService } from './market-maker.service';
import { MarketMakerConfigRepository } from './repositories';
import { MmOrderStrategyService } from './services/mm-order-strategy.service';

describe('MarketMakerService + MmOrderStrategyService Integration', () => {
  let marketMakerService: MarketMakerService;

  const cacheStore = new Map<string, any>();
  const cacheServiceMock = {
    get: jest.fn(async (key: string) => cacheStore.get(key) ?? null),
    set: jest.fn(async (key: string, value: any) => {
      cacheStore.set(key, value);
    }),
  };

  const configRepoMock = {
    findByUser: jest.fn(),
    findByUserPair: jest.fn(),
    save: jest.fn(),
    deleteByUserPair: jest.fn(),
  };

  const ordersServiceMock = {
    cancelOpenOrdersForPair: jest.fn(),
    createBatch: jest.fn(),
  };

  const marketsServiceMock = {
    findOne: jest.fn(),
    getTicker: jest.fn(),
  };

  const systemConfigMock = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    cacheStore.clear();
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MarketMakerService,
        MmOrderStrategyService,
        { provide: CacheService, useValue: cacheServiceMock },
        { provide: MarketMakerConfigRepository, useValue: configRepoMock },
        { provide: OrdersService, useValue: ordersServiceMock },
        { provide: MarketsService, useValue: marketsServiceMock },
        { provide: SystemConfigService, useValue: systemConfigMock },
      ],
    }).compile();

    marketMakerService = module.get(MarketMakerService);

    configRepoMock.findByUserPair.mockResolvedValue({
      config_id: 'cfg-1',
      user_id: 'user-1',
      pair_id: 'pair-1',
      spread_bps: 100,
      spread_alert_threshold_bps: 0,
      order_amount: '0.50',
      is_active: true,
      stop_loss_pct: null,
      max_position_base: null,
    });

    marketsServiceMock.findOne.mockResolvedValue({
      pair_id: 'pair-1',
      symbol: 'BTC/USDT',
      price_scale: 2,
    });

    // First read by MarketMakerService idempotency -> null
    // Second read by strategy (redis ticker) -> ticker payload
    cacheServiceMock.get
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ bid: '99', ask: '101', last_price: '100' });

    ordersServiceMock.cancelOpenOrdersForPair.mockResolvedValue([{ order_id: 'old-1' }]);
    ordersServiceMock.createBatch.mockResolvedValue({ created: [], count: 2 });
  });

  it('executes cancel + place on first refresh, then replays cached result for same cycle key', async () => {
    const first = (await marketMakerService.refreshMakerOrders(
      'user-1',
      'pair-1',
      'cycle-int-1',
      '0.75',
    )) as any;

    expect(first.idempotentReplay).toBe(false);
    expect(first.cancelledCount).toBe(1);
    expect(ordersServiceMock.cancelOpenOrdersForPair).toHaveBeenCalledTimes(1);
    expect(ordersServiceMock.createBatch).toHaveBeenCalledTimes(1);

    cacheServiceMock.get.mockResolvedValueOnce(first);

    const second = (await marketMakerService.refreshMakerOrders(
      'user-1',
      'pair-1',
      'cycle-int-1',
      '0.75',
    )) as any;

    expect(second.idempotentReplay).toBe(true);
    expect(ordersServiceMock.cancelOpenOrdersForPair).toHaveBeenCalledTimes(1);
    expect(ordersServiceMock.createBatch).toHaveBeenCalledTimes(1);
  });
});
