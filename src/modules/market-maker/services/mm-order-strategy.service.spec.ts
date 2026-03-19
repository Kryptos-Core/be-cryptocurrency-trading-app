/// <reference types="jest" />

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { CacheService } from '../../../common/services';
import { BusinessException } from '../../../common/exceptions';
import { MarketsService } from '../../markets/markets.service';
import { OrdersService } from '../../orders/orders.service';
import { MmOrderStrategyService } from './mm-order-strategy.service';
import { MarketMakerConfig } from '../../../entities/market-maker-config.entity';

describe('MmOrderStrategyService', () => {
  let service: MmOrderStrategyService;
  let cacheService: jest.Mocked<CacheService>;
  let marketsService: jest.Mocked<MarketsService>;
  let ordersService: jest.Mocked<OrdersService>;

  const mockConfig: MarketMakerConfig = {
    config_id: 'cfg-1',
    user_id: 'user-1',
    pair_id: 'pair-1',
    spread_bps: 100,
    spread_alert_threshold_bps: 0,
    order_amount: '0.50',
    is_active: true,
    stop_loss_pct: null,
    max_position_base: null,
    created_at: new Date(),
    updated_at: new Date(),
    user: undefined as any,
    pair: undefined as any,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MmOrderStrategyService,
        {
          provide: CacheService,
          useValue: {
            get: jest.fn(),
          },
        },
        {
          provide: MarketsService,
          useValue: {
            findOne: jest.fn(),
            getTicker: jest.fn(),
          },
        },
        {
          provide: OrdersService,
          useValue: {
            createBatch: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(MmOrderStrategyService);
    cacheService = module.get(CacheService);
    marketsService = module.get(MarketsService);
    ordersService = module.get(OrdersService);
  });

  it('places BUY/SELL orders around Redis mid-price', async () => {
    marketsService.findOne.mockResolvedValue({
      pair_id: 'pair-1',
      symbol: 'BTC/USDT',
      price_scale: 2,
    } as any);
    cacheService.get.mockResolvedValue({ bid: '99', ask: '101', last_price: '100' } as any);
    ordersService.createBatch.mockResolvedValue({ created: [] as any, count: 2 } as any);

    const result = await service.placeMakerOrders({
      userId: 'user-1',
      pairId: 'pair-1',
      config: mockConfig,
    });

    expect(ordersService.createBatch).toHaveBeenCalledTimes(1);
    const callArg = ordersService.createBatch.mock.calls[0][0] as any;
    expect(callArg.userId).toBe('user-1');
    expect(callArg.dto.orders).toHaveLength(2);
    expect(callArg.dto.orders[0].side).toBe('BUY');
    expect(callArg.dto.orders[0].price).toBe('99.50');
    expect(callArg.dto.orders[1].side).toBe('SELL');
    expect(callArg.dto.orders[1].price).toBe('100.50');
    expect(result.midPrice).toBe('100.00');
  });

  it('falls back to MarketsService ticker when Redis ticker missing', async () => {
    marketsService.findOne.mockResolvedValue({
      pair_id: 'pair-1',
      symbol: 'BTC/USDT',
      price_scale: 2,
    } as any);
    cacheService.get.mockResolvedValue(null);
    marketsService.getTicker.mockResolvedValue({
      bestBid: '98',
      bestAsk: '102',
      lastPrice: '100',
    } as any);
    ordersService.createBatch.mockResolvedValue({ created: [] as any, count: 2 } as any);

    const result = await service.placeMakerOrders({
      userId: 'user-1',
      pairId: 'pair-1',
      config: mockConfig,
      orderAmountOverride: '1.25',
    });

    const callArg = ordersService.createBatch.mock.calls[0][0] as any;
    expect(callArg.dto.orders[0].amount).toBe('1.25');
    expect(result.buyPrice).toBe('99.50');
    expect(result.sellPrice).toBe('100.50');
  });

  it('throws when no valid market price can be resolved', async () => {
    marketsService.findOne.mockResolvedValue({
      pair_id: 'pair-1',
      symbol: 'BTC/USDT',
      price_scale: 2,
    } as any);
    cacheService.get.mockResolvedValue(null);
    marketsService.getTicker.mockResolvedValue({
      bestBid: '0',
      bestAsk: '0',
      lastPrice: '0',
    } as any);

    await expect(
      service.placeMakerOrders({
        userId: 'user-1',
        pairId: 'pair-1',
        config: mockConfig,
      }),
    ).rejects.toThrow(BusinessException);

    expect(ordersService.createBatch).not.toHaveBeenCalled();
  });
});
