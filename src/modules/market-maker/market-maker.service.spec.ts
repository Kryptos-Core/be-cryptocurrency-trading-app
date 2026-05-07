/// <reference types="jest" />

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Test, type TestingModule } from '@nestjs/testing';
import { SystemConfigService } from '@/modules/system-config/system-config.service';
import { NotFoundException } from '../../common/exceptions';
import { CacheService } from '../../common/services';
import { MarketsService } from '../markets/markets.service';
import { OrdersService } from '../orders/orders.service';
import { MARKET_MAKER_CONFIG_REPOSITORY } from './domain/ports';
import { MarketMakerService } from './market-maker.service';
import { MmOrderStrategyService } from './services/mm-order-strategy.service';

describe('MarketMakerService', () => {
  let service: MarketMakerService;
  let configRepository: any;
  let cacheService: jest.Mocked<CacheService>;
  let ordersService: jest.Mocked<OrdersService>;
  let strategyService: jest.Mocked<MmOrderStrategyService>;
  let systemConfig: jest.Mocked<Pick<SystemConfigService, 'get'>>;

  const mockConfig = {
    config_id: 'cfg-1',
    user_id: 'user-1',
    pair_id: 'pair-1',
    spread_bps: 100,
    spread_alert_threshold_bps: 200,
    order_amount: '0.5',
    is_active: true,
    stop_loss_pct: null,
    max_position_base: null,
  } as any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MarketMakerService,
        {
          provide: MARKET_MAKER_CONFIG_REPOSITORY,
          useValue: {
            findByUser: jest.fn(),
            findByUserPair: jest.fn(),
            save: jest.fn(),
            deleteByUserPair: jest.fn(),
          },
        },
        {
          provide: MarketsService,
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: CacheService,
          useValue: {
            get: jest.fn(),
            set: jest.fn(),
          },
        },
        {
          provide: OrdersService,
          useValue: {
            cancelOpenOrdersForPair: jest.fn(),
          },
        },
        {
          provide: MmOrderStrategyService,
          useValue: {
            placeMakerOrders: jest.fn(),
          },
        },
        {
          provide: SystemConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(MarketMakerService);
    configRepository = module.get(MARKET_MAKER_CONFIG_REPOSITORY);
    cacheService = module.get(CacheService);
    ordersService = module.get(OrdersService);
    strategyService = module.get(MmOrderStrategyService);
    systemConfig = module.get(SystemConfigService);
  });

  it('getFormDefaults uses system config with app fallbacks', async () => {
    (systemConfig.get as jest.Mock).mockImplementation(async (key: unknown) => {
      const k = String(key);
      if (k === 'MM_DEFAULT_SPREAD_BPS') return 15;
      if (k === 'MM_DEFAULT_SPREAD_ALERT_THRESHOLD_BPS') return 25;
      if (k === 'MM_DEFAULT_ORDER_AMOUNT') return '0.01';
      return null;
    });

    const d = await service.getFormDefaults();

    expect(d).toEqual({
      spread_bps: 15,
      spread_alert_threshold_bps: 25,
      order_amount: '0.01',
    });
  });

  it('throws NotFoundException when config for pair does not exist', async () => {
    configRepository.findByUserPair.mockResolvedValue(null);

    await expect(service.getConfigByPair('user-1', 'pair-1')).rejects.toThrow(NotFoundException);
  });

  it('returns cached refresh result for same refresh cycle key', async () => {
    configRepository.findByUserPair.mockResolvedValue(mockConfig);
    cacheService.get.mockResolvedValue({
      refreshCycleKey: 'cycle-1',
      idempotentReplay: false,
    } as any);

    const result = (await service.refreshMakerOrders('user-1', 'pair-1', 'cycle-1')) as any;

    expect(result.idempotentReplay).toBe(true);
    expect(ordersService.cancelOpenOrdersForPair).not.toHaveBeenCalled();
    expect(strategyService.placeMakerOrders).not.toHaveBeenCalled();
  });

  it('cancels open orders then re-places maker orders and stores idempotency result', async () => {
    configRepository.findByUserPair.mockResolvedValue(mockConfig);
    cacheService.get.mockResolvedValue(null);
    ordersService.cancelOpenOrdersForPair.mockResolvedValue([
      { order_id: 'ord-1' } as any,
      { order_id: 'ord-2' } as any,
    ]);
    strategyService.placeMakerOrders.mockResolvedValue({
      count: 2,
      buyPrice: '99.50',
      sellPrice: '100.50',
    } as any);

    const result = (await service.refreshMakerOrders('user-1', 'pair-1', 'cycle-2')) as any;

    expect(ordersService.cancelOpenOrdersForPair).toHaveBeenCalledWith('user-1', 'pair-1');
    expect(strategyService.placeMakerOrders).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', pairId: 'pair-1' }),
    );
    expect(cacheService.set).toHaveBeenCalled();
    expect(result.cancelledCount).toBe(2);
    expect(result.idempotentReplay).toBe(false);
  });

  it('returns skipped when config inactive', async () => {
    configRepository.findByUserPair.mockResolvedValue({ ...mockConfig, is_active: false });

    const result = (await service.refreshMakerOrders('user-1', 'pair-1', 'cycle-3')) as any;

    expect(result.skipped).toBe(true);
    expect(ordersService.cancelOpenOrdersForPair).not.toHaveBeenCalled();
  });
});
