import { Injectable } from '@nestjs/common';
import { uuidv7 } from 'uuidv7';
import { NotFoundException } from '@/common/exceptions';
import { CacheService } from '@/common/services';
import { MarketMakerConfig } from '@/entities/market-maker-config.entity';
import { MarketsService } from '@/modules/markets/markets.service';
import { OrdersService } from '@/modules/orders/orders.service';
import { SystemConfigService } from '@/modules/system-config/system-config.service';
import type { UpsertMarketMakerConfigDto } from './dto';
import { MarketMakerConfigRepository } from './repositories';
import { MmOrderStrategyService } from './services/mm-order-strategy.service';

const MM_REFRESH_IDEMPOTENCY_TTL_SEC = 300;

@Injectable()
export class MarketMakerService {
  constructor(
    private readonly configRepository: MarketMakerConfigRepository,
    private readonly marketsService: MarketsService,
    private readonly cacheService: CacheService,
    private readonly ordersService: OrdersService,
    private readonly mmOrderStrategyService: MmOrderStrategyService,
    private readonly systemConfigService: SystemConfigService,
  ) {}

  async getConfigList(userId: string) {
    return this.configRepository.findByUser(userId);
  }

  /** Defaults for MM config form when no row exists (system_configs + env fallbacks). */
  async getFormDefaults() {
    const spread = await this.systemConfigService.get<number>('MM_DEFAULT_SPREAD_BPS');
    const alert = await this.systemConfigService.get<number>(
      'MM_DEFAULT_SPREAD_ALERT_THRESHOLD_BPS',
    );
    const orderAmt = await this.systemConfigService.get<string>('MM_DEFAULT_ORDER_AMOUNT');
    const spreadBps = spread != null && Number.isFinite(spread) ? spread : 10;
    const alertBps = alert != null && Number.isFinite(alert) ? alert : 20;
    const order =
      orderAmt != null && String(orderAmt).trim().length > 0 ? String(orderAmt).trim() : '0.001';
    return {
      spread_bps: spreadBps,
      spread_alert_threshold_bps: alertBps,
      order_amount: order,
    };
  }

  async getConfigByPair(userId: string, pairId: string) {
    const config = await this.configRepository.findByUserPair(userId, pairId);
    if (!config) {
      throw new NotFoundException('Market maker config', `${userId}:${pairId}`);
    }
    return config;
  }

  async upsertConfig(userId: string, pairId: string, dto: UpsertMarketMakerConfigDto) {
    await this.marketsService.findOne(pairId);

    const existing = await this.configRepository.findByUserPair(userId, pairId);
    const model = existing ?? new MarketMakerConfig();

    if (!existing) {
      model.config_id = uuidv7();
      model.user_id = userId;
      model.pair_id = pairId;
    }

    model.spread_bps = dto.spread_bps;
    model.spread_alert_threshold_bps = dto.spread_alert_threshold_bps ?? 0;
    model.order_amount = dto.order_amount;
    model.is_active = dto.is_active ?? true;
    model.stop_loss_pct = dto.stop_loss_pct ?? null;
    model.max_position_base = dto.max_position_base ?? null;

    return this.configRepository.save(model);
  }

  async deleteConfig(userId: string, pairId: string) {
    const deleted = await this.configRepository.deleteByUserPair(userId, pairId);
    return { deleted };
  }

  async placeMakerOrders(userId: string, pairId: string, orderAmountOverride?: string) {
    return this.refreshMakerOrders(userId, pairId, undefined, orderAmountOverride);
  }

  async refreshMakerOrders(
    userId: string,
    pairId: string,
    refreshCycleKey?: string,
    orderAmountOverride?: string,
  ) {
    const config = await this.getConfigByPair(userId, pairId);
    if (!config.is_active) {
      return {
        skipped: true,
        reason: 'Config is not active',
      };
    }

    const cycleKey = refreshCycleKey ?? this.buildDefaultRefreshCycleKey();
    const idempotencyKey = `mm:refresh:${userId}:${pairId}:${cycleKey}`;

    const cached = await this.cacheService.get<Record<string, unknown>>(idempotencyKey);
    if (cached) {
      return {
        ...cached,
        idempotentReplay: true,
      };
    }

    const cancelled = await this.ordersService.cancelOpenOrdersForPair(userId, pairId);
    const placed = await this.mmOrderStrategyService.placeMakerOrders({
      userId,
      pairId,
      config,
      orderAmountOverride,
    });

    const response = {
      refreshCycleKey: cycleKey,
      cancelledCount: cancelled.length,
      cancelledOrderIds: cancelled.map((item) => item.order_id),
      placed,
      idempotentReplay: false,
    };

    await this.cacheService.set(idempotencyKey, response, MM_REFRESH_IDEMPOTENCY_TTL_SEC);

    return response;
  }

  async getDashboard(userId: string) {
    const configs = await this.configRepository.findByUser(userId);
    return {
      userId,
      configCount: configs.length,
      activeConfigCount: configs.filter((item) => item.is_active).length,
      configs,
      positions: [],
      estimatedPnl: '0',
    };
  }

  private buildDefaultRefreshCycleKey(): string {
    return `cycle_${Math.floor(Date.now() / 30000)}`;
  }
}
