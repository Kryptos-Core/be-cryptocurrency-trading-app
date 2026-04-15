import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import Decimal from 'decimal.js';
import { uuidv7 } from 'uuidv7';
import { ExchangeRateAuditLog } from '@/entities/exchange-rate-audit-log.entity';
import { RedisService } from '@/common/services/redis.service';
import { EXCHANGE_RATE_AUDIT_REPOSITORY, type ExchangeRateAuditRepositoryPort } from './domain/ports';
import type { PayosGatewayConfig } from '@/modules/payment-config/interfaces/payment-gateway-config.interface';
import { PaymentConfigService } from '@/modules/payment-config/payment-config.service';
import { DepositsService } from '@/modules/deposits/deposits.service';
import { UsersService } from '@/modules/users/users.service';
import {
  EXCHANGE_RATE_ALERTS_CHANNEL,
  type ExchangeRateAutoSyncAlertEvent,
} from '@/modules/exchange-rate/constants';
import type { MarketPricesDto } from './dto/market-prices.dto';
import type { RatePreviewDto } from './dto/rate-preview.dto';
import type { SyncRateDto } from './dto/sync-rate.dto';
import type { UpdateFxRateDto } from './dto/update-fx-rate.dto';
import { CoinGeckoProvider } from './providers/coingecko.provider';
import { FiatRateProvider } from './providers/fiat-rate.provider';

const DEFAULT_AUTO_SYNC_INTERVAL_MINUTES = 15;
const DEFAULT_AUTO_SYNC_SOURCE = 'coingecko' as const;
const DEFAULT_RATE_CHANGE_ALERT_THRESHOLD_PCT = 5;
const SYSTEM_AUTO_SYNC_ACTOR_ID = '00000000-0000-7000-8000-000000000001';

type RateMode = 'manual_override' | 'auto_sync';

type AutoSyncSkipReason =
  | 'payos_config_not_found'
  | 'auto_sync_disabled'
  | 'interval_not_due';

export type AutoSyncTickResult =
  | {
      status: 'skipped';
      reason: AutoSyncSkipReason;
    }
  | {
      status: 'synced';
      source: 'coingecko' | 'exchangerate_host';
      previousRate: string;
      newRate: string;
      changePct: string;
      thresholdPct: string;
      alerted: boolean;
    };

@Injectable()
export class ExchangeRateService {
  private readonly logger = new Logger(ExchangeRateService.name);

  constructor(
    private readonly coinGeckoProvider: CoinGeckoProvider,
    private readonly fiatRateProvider: FiatRateProvider,
    private readonly redisService: RedisService,
    private readonly depositsService: DepositsService,
    private readonly paymentConfigService: PaymentConfigService,
    private readonly usersService: UsersService,
    @Inject(EXCHANGE_RATE_AUDIT_REPOSITORY)
    private readonly auditRepository: ExchangeRateAuditRepositoryPort,
  ) {}

  async getMarketPrices(query: MarketPricesDto) {
    const symbols = query.symbols
      ?.split(',')
      .map((symbol) => symbol.trim().toUpperCase())
      .filter(Boolean);
    return this.coinGeckoProvider.getMarketPrices(symbols);
  }

  async getDepositPreview(dto: RatePreviewDto) {
    const fiatSymbol = (dto.fiatSymbol ?? 'VND').trim().toUpperCase();
    if (fiatSymbol !== 'VND') {
      throw new BadRequestException('Only VND preview is currently supported');
    }

    const [preview, market, config] = await Promise.all([
      this.depositsService.getDepositPreview(dto.fiatAmount, fiatSymbol),
      this.coinGeckoProvider.getUsdtVndMarketSnapshot(),
      this.paymentConfigService.getActiveConfig('PAYOS', 'MAINNET'),
    ]);

    return {
      ...preview,
      marketRate: market.marketRate,
      rateSource: this.resolveRateMode(config as PayosGatewayConfig | null),
      updatedAt: market.updatedAt,
    };
  }

  async getAdminCurrentConfig() {
    const { config } = await this.requirePayosConfig();
    const market = await this.coinGeckoProvider.getUsdtVndMarketSnapshot();
    const configuredRate = new Decimal(config.fiatToQuoteRate);
    const marketRate = new Decimal(market.marketRate);
    const deviationPct = configuredRate.minus(marketRate).div(marketRate).mul(100);
    const lastUpdatedBy = await this.resolveLatestUpdaterEmail();
    const rateSource = this.resolveRateMode(config);
    const nextDueAt = this.resolveNextDueAt(config);

    return {
      fiatToQuoteRate: config.fiatToQuoteRate,
      fxSpreadBps: config.fxSpreadBps,
      rateSource,
      marketRate: market.marketRate,
      deviation: `${deviationPct.gte(0) ? '+' : ''}${deviationPct.toFixed(3)}%`,
      lastSyncAt: config.lastSyncAt ?? market.updatedAt,
      nextDueAt,
      lastUpdatedBy,
    };
  }

  async syncAdminConfig(
    dto: SyncRateDto,
    actor: { userId: string },
    options?: { appliedAt?: Date },
  ) {
    const appliedAt = options?.appliedAt ?? new Date();
    const { configId, config: currentConfig } = await this.requirePayosConfig();
    const market = await this.resolveMarketReference(dto.source);
    const nextRate = new Decimal(1).div(market.rate).toFixed(8, Decimal.ROUND_DOWN);

    await this.persistPayosConfig(
      configId,
      currentConfig,
      {
        fiatToQuoteRate: nextRate,
        fxSpreadBps: currentConfig.fxSpreadBps,
        autoSyncEnabled: currentConfig.autoSyncEnabled ?? false,
        autoSyncIntervalMinutes:
          currentConfig.autoSyncIntervalMinutes ?? DEFAULT_AUTO_SYNC_INTERVAL_MINUTES,
        autoSyncSource: dto.source,
        rateChangeAlertThresholdPct:
          currentConfig.rateChangeAlertThresholdPct ?? DEFAULT_RATE_CHANGE_ALERT_THRESHOLD_PCT,
        lastSyncAt: appliedAt.toISOString(),
        reason: null,
      },
      actor.userId,
      'AUTO_SYNC',
      market.source,
      new Decimal(1).div(market.rate).toFixed(8, Decimal.ROUND_DOWN),
    );

    return {
      previousRate: currentConfig.fiatToQuoteRate,
      newRate: nextRate,
      source: market.source,
      appliedAt: appliedAt.toISOString(),
    };
  }

  async updateAdminConfig(dto: UpdateFxRateDto, actor: { userId: string }) {
    const { configId, config: currentConfig } = await this.requirePayosConfig();
    const market = await this.coinGeckoProvider.getUsdtVndMarketSnapshot();

    const nextRate = dto.fiatToQuoteRate ?? currentConfig.fiatToQuoteRate;
    const nextSpread = dto.fxSpreadBps ?? currentConfig.fxSpreadBps;
    const nextRateDecimal = new Decimal(nextRate);
    const spreadBpsDecimal = new Decimal(nextSpread);
    const nextAutoSyncEnabled = dto.autoSync ?? currentConfig.autoSyncEnabled ?? false;
    const nextAutoSyncIntervalMinutes =
      dto.autoSyncIntervalMinutes ??
      currentConfig.autoSyncIntervalMinutes ??
      DEFAULT_AUTO_SYNC_INTERVAL_MINUTES;
    const nextAutoSyncSource =
      dto.autoSyncSource ??
      currentConfig.autoSyncSource ??
      DEFAULT_AUTO_SYNC_SOURCE;
    const nextRateChangeAlertThresholdPct =
      dto.rateChangeAlertThresholdPct ??
      currentConfig.rateChangeAlertThresholdPct ??
      DEFAULT_RATE_CHANGE_ALERT_THRESHOLD_PCT;

    if (nextAutoSyncEnabled && nextAutoSyncIntervalMinutes < 1) {
      throw new BadRequestException('autoSyncIntervalMinutes must be greater than 0');
    }

    if (!spreadBpsDecimal.isFinite() || spreadBpsDecimal.lt(0) || spreadBpsDecimal.gt(10000)) {
      throw new BadRequestException('fxSpreadBps must be between 0 and 10000');
    }

    if (!nextRateDecimal.isFinite() || nextRateDecimal.lte(0)) {
      throw new BadRequestException('fiatToQuoteRate must be a positive number');
    }

    if (
      !Number.isFinite(nextRateChangeAlertThresholdPct) ||
      nextRateChangeAlertThresholdPct <= 0 ||
      nextRateChangeAlertThresholdPct > 100
    ) {
      throw new BadRequestException('rateChangeAlertThresholdPct must be between 0 and 100');
    }

    const action =
      dto.fiatToQuoteRate == null &&
      dto.fxSpreadBps != null &&
      dto.fxSpreadBps !== currentConfig.fxSpreadBps
        ? 'SPREAD_UPDATE'
        : 'MANUAL_UPDATE';

    const auditEntryId = await this.persistPayosConfig(
      configId,
      currentConfig,
      {
        fiatToQuoteRate: nextRate,
        fxSpreadBps: nextSpread,
        autoSyncEnabled: nextAutoSyncEnabled,
        autoSyncIntervalMinutes: nextAutoSyncIntervalMinutes,
        autoSyncSource: nextAutoSyncSource,
        rateChangeAlertThresholdPct: nextRateChangeAlertThresholdPct,
        lastSyncAt: currentConfig.lastSyncAt ?? null,
        reason: dto.reason ?? null,
      },
      actor.userId,
      action,
      'manual',
      market.marketRate,
    );

    return {
      fiatToQuoteRate: nextRate,
      fxSpreadBps: nextSpread,
      autoSyncEnabled: nextAutoSyncEnabled,
      autoSyncIntervalMinutes: nextAutoSyncIntervalMinutes,
      autoSyncSource: nextAutoSyncSource,
      rateChangeAlertThresholdPct: nextRateChangeAlertThresholdPct,
      rateSource: this.resolveRateMode({
        ...currentConfig,
        autoSyncEnabled: nextAutoSyncEnabled,
      }),
      auditEntryId,
    };
  }

  async runAutoSyncSchedulerTick(now = new Date()): Promise<AutoSyncTickResult> {
    const config = (await this.paymentConfigService.getActiveConfig(
      'PAYOS',
      'MAINNET',
    )) as (PayosGatewayConfig & { config_id?: string }) | null;

    if (!config) {
      return {
        status: 'skipped',
        reason: 'payos_config_not_found',
      };
    }

    if (!config.autoSyncEnabled) {
      return {
        status: 'skipped',
        reason: 'auto_sync_disabled',
      };
    }

    const intervalMinutes = this.resolveAutoSyncIntervalMinutes(config.autoSyncIntervalMinutes);
    if (!this.isAutoSyncDue(config.lastSyncAt, intervalMinutes, now)) {
      return {
        status: 'skipped',
        reason: 'interval_not_due',
      };
    }

    const source = this.resolveAutoSyncSource(config.autoSyncSource);
    const syncResult = await this.syncAdminConfig(
      { source },
      { userId: SYSTEM_AUTO_SYNC_ACTOR_ID },
      { appliedAt: now },
    );

    const changePct = this.calculateRateChangePct(syncResult.previousRate, syncResult.newRate);
    const thresholdPct = new Decimal(
      this.resolveRateChangeAlertThresholdPct(config.rateChangeAlertThresholdPct),
    );
    const alerted = changePct.gte(thresholdPct);
    const syncedAt = new Date(syncResult.appliedAt);
    const syncTime = Number.isNaN(syncedAt.getTime()) ? now : syncedAt;
    const nextDueAt = new Date(syncTime.getTime() + intervalMinutes * 60 * 1000).toISOString();

    if (alerted) {
      const alertEvent: ExchangeRateAutoSyncAlertEvent = {
        event: 'exchange_rate.auto_sync.threshold_alert',
        source,
        previousRate: syncResult.previousRate,
        newRate: syncResult.newRate,
        changePct: changePct.toFixed(3),
        thresholdPct: thresholdPct.toFixed(3),
        intervalMinutes,
        lastSyncAt: syncTime.toISOString(),
        nextDueAt,
        timestamp: new Date().toISOString(),
      };

      await this.publishAutoSyncAlertEvent(alertEvent);

      this.logger.warn(
        `[ExchangeRateAutoSyncAlert] source=${source} previousRate=${syncResult.previousRate} ` +
          `newRate=${syncResult.newRate} changePct=${changePct.toFixed(3)} thresholdPct=${thresholdPct.toFixed(3)} ` +
          `intervalMinutes=${intervalMinutes} lastSyncAt=${config.lastSyncAt ?? 'none'}`,
      );
    }

    return {
      status: 'synced',
      source,
      previousRate: syncResult.previousRate,
      newRate: syncResult.newRate,
      changePct: changePct.toFixed(3),
      thresholdPct: thresholdPct.toFixed(3),
      alerted,
    };
  }

  private async requirePayosConfig(): Promise<{
    configId: string;
    config: PayosGatewayConfig;
  }> {
    const config = await this.paymentConfigService.getActiveConfig('PAYOS', 'MAINNET');
    if (!config) {
      throw new NotFoundException('Active PayOS config not found');
    }

    const configs = await this.paymentConfigService.listConfigs();
    const activePayosConfig = configs
      .filter((item) => item.type === 'PAYOS' && item.network === 'MAINNET' && item.status === 'ACTIVE')
      .sort((a, b) => Number(b.config_version ?? 0) - Number(a.config_version ?? 0))[0];

    if (!activePayosConfig?.config_id) {
      throw new NotFoundException('Active PayOS config id is missing');
    }

    return {
      configId: activePayosConfig.config_id,
      config: config as PayosGatewayConfig,
    };
  }

  private async persistPayosConfig(
    configId: string,
    currentConfig: PayosGatewayConfig,
    next: {
      fiatToQuoteRate: string;
      fxSpreadBps: string;
      autoSyncEnabled: boolean;
      autoSyncIntervalMinutes: number;
      autoSyncSource: 'coingecko' | 'exchangerate_host';
      rateChangeAlertThresholdPct: number;
      lastSyncAt: string | null;
      reason: string | null;
    },
    actorUserId: string,
    action: string,
    source: string,
    marketRate: string,
  ): Promise<string> {
    const updatedConfig: PayosGatewayConfig = {
      ...currentConfig,
      fiatToQuoteRate: next.fiatToQuoteRate,
      fxSpreadBps: next.fxSpreadBps,
      autoSyncEnabled: next.autoSyncEnabled,
      autoSyncIntervalMinutes: next.autoSyncIntervalMinutes,
      autoSyncSource: next.autoSyncSource,
      rateChangeAlertThresholdPct: next.rateChangeAlertThresholdPct,
      lastSyncAt: next.lastSyncAt ?? undefined,
    };

    await this.paymentConfigService.updateConfig(
      configId,
      {
        config: updatedConfig as unknown as Record<string, unknown>,
      },
      actorUserId,
    );

    const auditId = uuidv7();
    await this.auditRepository.save({
      audit_id: auditId,
      changed_by: actorUserId,
      action,
      previous_rate: currentConfig.fiatToQuoteRate,
      new_rate: next.fiatToQuoteRate,
      previous_spread_bps: currentConfig.fxSpreadBps,
      new_spread_bps: next.fxSpreadBps,
      market_rate: marketRate,
      source,
      reason: next.reason,
    } as ExchangeRateAuditLog);

    return auditId;
  }

  private async resolveMarketReference(source: 'coingecko' | 'exchangerate_host') {
    if (source === 'coingecko') {
      const snapshot = await this.coinGeckoProvider.getUsdtVndMarketSnapshot();
      return {
        rate: new Decimal(1).div(snapshot.marketRate).toString(),
        updatedAt: snapshot.updatedAt,
        source: snapshot.source,
      };
    }

    return this.fiatRateProvider.getUsdToVndRate();
  }

  private resolveRateMode(config: PayosGatewayConfig | null): RateMode {
    return config?.autoSyncEnabled ? 'auto_sync' : 'manual_override';
  }

  private resolveNextDueAt(config: PayosGatewayConfig): string | null {
    if (!config.autoSyncEnabled) {
      return null;
    }

    const intervalMinutes = this.resolveAutoSyncIntervalMinutes(config.autoSyncIntervalMinutes);
    if (!config.lastSyncAt) {
      return new Date().toISOString();
    }

    const parsedLastSyncAt = new Date(config.lastSyncAt);
    if (Number.isNaN(parsedLastSyncAt.getTime())) {
      return new Date().toISOString();
    }

    return new Date(parsedLastSyncAt.getTime() + intervalMinutes * 60 * 1000).toISOString();
  }

  private resolveAutoSyncIntervalMinutes(configValue?: number): number {
    if (!Number.isFinite(configValue) || (configValue ?? 0) <= 0) {
      return DEFAULT_AUTO_SYNC_INTERVAL_MINUTES;
    }
    return Math.floor(configValue as number);
  }

  private resolveRateChangeAlertThresholdPct(configValue?: number): number {
    if (!Number.isFinite(configValue) || (configValue ?? 0) <= 0) {
      return DEFAULT_RATE_CHANGE_ALERT_THRESHOLD_PCT;
    }
    return Number(configValue);
  }

  private resolveAutoSyncSource(
    source?: 'coingecko' | 'exchangerate_host',
  ): 'coingecko' | 'exchangerate_host' {
    return source === 'exchangerate_host' ? source : DEFAULT_AUTO_SYNC_SOURCE;
  }

  private isAutoSyncDue(lastSyncAt: string | undefined, intervalMinutes: number, now: Date): boolean {
    if (!lastSyncAt) {
      return true;
    }

    const parsedLastSyncAt = new Date(lastSyncAt);
    if (Number.isNaN(parsedLastSyncAt.getTime())) {
      return true;
    }

    const elapsedMs = now.getTime() - parsedLastSyncAt.getTime();
    return elapsedMs >= intervalMinutes * 60 * 1000;
  }

  private calculateRateChangePct(previousRate: string, newRate: string): Decimal {
    const previous = new Decimal(previousRate);
    const next = new Decimal(newRate);
    if (!previous.isFinite() || previous.lte(0)) {
      return new Decimal(0);
    }

    return next.minus(previous).abs().div(previous).mul(100);
  }

  private async publishAutoSyncAlertEvent(payload: ExchangeRateAutoSyncAlertEvent): Promise<void> {
    try {
      await this.redisService.publish(EXCHANGE_RATE_ALERTS_CHANNEL, JSON.stringify(payload));
    } catch (error) {
      this.logger.error(
        `[ExchangeRateAutoSyncAlert] publish failed: ${(error as Error).message}`,
      );
    }
  }

  private async resolveLatestUpdaterEmail(): Promise<string | null> {
    const latestAudits = await this.auditRepository.findLatest(1);
    const latestAudit = latestAudits[0];

    if (!latestAudit?.changed_by) {
      return null;
    }

    try {
      const user = await this.usersService.findOne(latestAudit.changed_by);
      return user.email ?? null;
    } catch {
      return null;
    }
  }

}
