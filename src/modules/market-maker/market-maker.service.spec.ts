/// <reference types="jest" />

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '../../common/exceptions';
import { CacheService } from '../../common/services';
import { MarketsService } from '../markets/markets.service';
import { OrdersService } from '../orders/orders.service';
import { MarketMakerConfigRepository } from './repositories';
import { MmOrderStrategyService } from './services/mm-order-strategy.service';
import { MarketMakerService } from './market-maker.service';

describe('MarketMakerService', () => {
  let service: MarketMakerService;
  let configRepository: jest.Mocked<MarketMakerConfigRepository>;
  let cacheService: jest.Mocked<CacheService>;
  let ordersService: jest.Mocked<OrdersService>;
  let strategyService: jest.Mocked<MmOrderStrategyService>;

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
          provide: MarketMakerConfigRepository,
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
      ],
    }).compile();

    service = module.get(MarketMakerService);
    configRepository = module.get(MarketMakerConfigRepository);
    cacheService = module.get(CacheService);
    ordersService = module.get(OrdersService);
    strategyService = module.get(MmOrderStrategyService);
  });

  it('throws NotFoundException when config for pair does not exist', async () => {
    configRepository.findByUserPair.mockResolvedValue(null);

    await expect(service.getConfigByPair('user-1', 'pair-1')).rejects.toThrow(NotFoundException);
  });

  it('returns cached refresh result for same refresh cycle key', async () => {
    configRepository.findByUserPair.mockResolvedValue(mockConfig);
    cacheService.get.mockResolvedValue({ refreshCycleKey: 'cycle-1', idempotentReplay: false } as any);

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
