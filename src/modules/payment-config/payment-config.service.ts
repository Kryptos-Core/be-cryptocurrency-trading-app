import { InjectQueue } from '@nestjs/bull';
import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Queue } from 'bull';
import { uuidv7 } from 'uuidv7';
import { WalletEncryptionService } from '@/common/services';
import { RedisService } from '@/common/services/redis.service';
import type {
  PaymentMethodConfig,
  PaymentMethodType,
} from '@/entities/payment-method-config.entity';
import { PAYMENT_CONFIG_REPOSITORY, type PaymentConfigRepositoryPort } from './domain/ports';
import type {
  ActivatePaymentConfigDto,
  CreatePaymentConfigDto,
  UpdatePaymentConfigDto,
} from './dto';
import {
  PAYMENT_CONFIG_EVENTS_CHANNEL,
  type PaymentConfigEvent,
  type PaymentGatewayConfig,
} from './interfaces/payment-gateway-config.interface';
import {
  buildPaymentConfigFormOptions,
  isPaymentConfigTypeNetworkPairAllowed,
  resolvePaymentConfigFormOptionsEnv,
} from './payment-config-form-options.util';

export const PAYMENT_CONFIG_QUEUE = 'payment-config-activation';
export const ACTIVATE_JOB = 'activate-config';

/** Redis cache TTL in seconds for active payment configs */
const CACHE_TTL_SECONDS = 60;

interface CacheEntry {
  config: PaymentGatewayConfig;
  version: number;
}

/**
 * PaymentConfigService
 *
 * Facade Pattern: single entry point for all payment config operations.
 * Cache-Aside Pattern: Redis L2 cache (60s TTL) + in-memory L1 cache per process.
 * Observer Pattern: publishes config change events to Redis Pub/Sub.
 */
@Injectable()
export class PaymentConfigService {
  private readonly logger = new Logger(PaymentConfigService.name);

  /** In-process L1 cache keyed by `{type}:{network}` */
  private readonly memCache = new Map<string, CacheEntry>();

  constructor(
    @Inject(PAYMENT_CONFIG_REPOSITORY)
    private readonly repo: PaymentConfigRepositoryPort,
    private readonly encryptionService: WalletEncryptionService,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
    @InjectQueue(PAYMENT_CONFIG_QUEUE) private readonly activationQueue: Queue,
  ) {}

  // ── Public Read ──────────────────────────────────────────────────────────

  /**
   * Get decrypted active config for a given type+network.
   * Cache-Aside: L1 (memory) → L2 (Redis 60s) → DB.
   * Returns null if no ACTIVE config in DB (callers should fall back to .env).
   */
  async getActiveConfig(
    type: PaymentMethodType,
    network: string,
  ): Promise<PaymentGatewayConfig | null> {
    const cacheKey = `${type}:${network}`;

    // L1 — in-process memory cache
    const memHit = this.memCache.get(cacheKey);
    if (memHit) return memHit.config;

    // L2 — Redis
    const redisKey = `payment_config:${cacheKey}:active`;
    try {
      const cached = await this.redisService.get(redisKey);
      if (cached) {
        const entry = JSON.parse(cached) as CacheEntry;
        this.memCache.set(cacheKey, entry);
        return entry.config;
      }
    } catch {
      // Redis unavailable — fall through to DB
    }

    // DB
    const record = await this.repo.findActive(type, network);
    if (!record) return null;

    const config = this.decrypt(record.encrypted_config);
    const entry: CacheEntry = { config, version: record.config_version };

    this.memCache.set(cacheKey, entry);
    try {
      await this.redisService.set(redisKey, JSON.stringify(entry), CACHE_TTL_SECONDS);
    } catch {
      // Redis write failure is non-critical
    }

    return config;
  }

  async listConfigs(): Promise<Omit<PaymentMethodConfig, 'encrypted_config'>[]> {
    return this.repo.findAll();
  }

  /**
   * Form metadata for admin payment-config UI (types × networks).
   * Keeps a single source of truth with the DTO enum + product rules.
   */
  getFormOptions(): {
    types: string[];
    networksByType: Record<string, string[]>;
  } {
    const env = resolvePaymentConfigFormOptionsEnv(this.configService);
    return buildPaymentConfigFormOptions(env.mainnetOnly, env.tronDefaultNetwork);
  }

  /**
   * Admin UI: full row + decrypted credentials for edit form.
   * Same RBAC as list/update — never log [config] contents.
   */
  async getConfigByIdForEdit(configId: string): Promise<{
    config_id: string;
    type: PaymentMethodType;
    network: string;
    display_name: string;
    config_version: number;
    status: string;
    grace_period_minutes: number;
    transition_started_at: string | null;
    activated_at: string | null;
    sort_order: number;
    created_by: string;
    updated_by: string;
    created_at: string;
    updated_at: string;
    config: PaymentGatewayConfig;
  }> {
    const existing = await this.repo.findById(configId);
    if (!existing) {
      throw new NotFoundException('PaymentMethodConfig', configId);
    }
    const config = this.decrypt(existing.encrypted_config);
    return {
      config_id: existing.config_id,
      type: existing.type,
      network: existing.network,
      display_name: existing.display_name,
      config_version: existing.config_version,
      status: existing.status,
      grace_period_minutes: existing.grace_period_minutes,
      transition_started_at: existing.transition_started_at?.toISOString() ?? null,
      activated_at: existing.activated_at?.toISOString() ?? null,
      sort_order: existing.sort_order,
      created_by: existing.created_by,
      updated_by: existing.updated_by,
      created_at: existing.created_at.toISOString(),
      updated_at: existing.updated_at.toISOString(),
      config,
    };
  }

  // ── Public Write ─────────────────────────────────────────────────────────

  async createConfig(dto: CreatePaymentConfigDto, userId: string): Promise<PaymentMethodConfig> {
    const env = resolvePaymentConfigFormOptionsEnv(this.configService);
    if (
      !isPaymentConfigTypeNetworkPairAllowed(
        dto.type,
        dto.network,
        env.mainnetOnly,
        env.tronDefaultNetwork,
      )
    ) {
      throw new BadRequestException(
        `Invalid payment config type/network for current environment: ${dto.type}/${dto.network}`,
      );
    }

    const configId = uuidv7();
    const encryptedConfig = this.encryptionService.encrypt(JSON.stringify(dto.config));

    return this.repo.upsert(
      configId,
      dto.type,
      dto.network,
      dto.display_name,
      encryptedConfig,
      dto.grace_period_minutes ?? 15,
      dto.sort_order ?? 0,
      userId,
    );
  }

  async updateConfig(
    configId: string,
    dto: UpdatePaymentConfigDto,
    userId: string,
  ): Promise<PaymentMethodConfig> {
    const existing = await this.repo.findById(configId);
    if (!existing) throw new NotFoundException('PaymentMethodConfig', configId);

    const newEncrypted = dto.config
      ? this.encryptionService.encrypt(JSON.stringify(dto.config))
      : existing.encrypted_config;

    const updated = await this.repo.upsert(
      configId,
      existing.type,
      existing.network,
      dto.display_name ?? existing.display_name,
      newEncrypted,
      dto.grace_period_minutes ?? existing.grace_period_minutes,
      dto.sort_order ?? existing.sort_order,
      userId,
    );

    await this.invalidateCache(existing.type, existing.network);
    return updated;
  }

  /**
   * Start the grace-period activation flow:
   * 1. Set status = TRANSITIONING
   * 2. Publish TRANSITIONING event to Redis (→ WebSocket → Trader banners)
   * 3. Schedule a Bull delayed job to complete activation after graceMins
   */
  async activateWithGracePeriod(
    configId: string,
    dto: ActivatePaymentConfigDto,
    userId: string,
  ): Promise<{ graceMins: number; activatesAt: string }> {
    const existing = await this.repo.findById(configId);
    if (!existing) throw new NotFoundException('PaymentMethodConfig', configId);

    if (existing.status === 'ACTIVE') {
      throw new BadRequestException('Config is already ACTIVE');
    }

    const graceMins = dto.grace_period_minutes ?? existing.grace_period_minutes;
    await this.repo.setStatus(configId, 'TRANSITIONING', userId);
    await this.invalidateCache(existing.type, existing.network);

    await this.publishEvent({
      event: 'TRANSITIONING',
      type: existing.type,
      network: existing.network,
      configId,
      graceMins,
      timestamp: new Date().toISOString(),
    });

    // Schedule Bull job to fire after grace period
    const delayMs = graceMins * 60 * 1000;
    await this.activationQueue.add(
      ACTIVATE_JOB,
      { configId, type: existing.type, network: existing.network, userId },
      { delay: delayMs, attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
    );

    const activatesAt = new Date(Date.now() + delayMs).toISOString();
    this.logger.log(
      `PaymentConfig ${configId} (${existing.type}/${existing.network}) entering grace period of ${graceMins}min — activates at ${activatesAt}`,
    );

    return { graceMins, activatesAt };
  }

  /**
   * Immediately deactivate a config without grace period.
   * Used by the admin to disable a broken gateway.
   */
  async deactivateConfig(configId: string, userId: string): Promise<void> {
    const existing = await this.repo.findById(configId);
    if (!existing) throw new NotFoundException('PaymentMethodConfig', configId);

    await this.repo.setStatus(configId, 'INACTIVE', userId);
    await this.invalidateCache(existing.type, existing.network);

    await this.publishEvent({
      event: 'DEACTIVATED',
      type: existing.type,
      network: existing.network,
      configId,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Called by the Bull processor after the grace period expires.
   * Deactivates any previously ACTIVE config of the same type+network, then activates this one.
   */
  async completeActivation(
    configId: string,
    type: PaymentMethodType,
    network: string,
    userId: string,
  ): Promise<void> {
    // Find and deactivate any currently ACTIVE config for this type+network
    const currentActive = await this.repo.findActive(type, network);
    if (currentActive && currentActive.config_id !== configId) {
      await this.repo.setStatus(currentActive.config_id, 'INACTIVE', userId);
    }

    // Activate the new config
    await this.repo.setStatus(configId, 'ACTIVE', userId);
    await this.invalidateCache(type, network);

    await this.publishEvent({
      event: 'ACTIVATED',
      type,
      network,
      configId,
      timestamp: new Date().toISOString(),
    });

    this.logger.log(`PaymentConfig ${configId} (${type}/${network}) is now ACTIVE`);
  }

  /**
   * Safety net when Redis/Bull is down or the delayed job failed after retries.
   * Idempotent with Bull: completeActivation is safe if already ACTIVE.
   */
  async flushStaleTransitioningActivations(): Promise<void> {
    const stale = await this.repo.findTransitioningPastGrace();
    for (const row of stale) {
      try {
        this.logger.log(
          `Cron flush: completing TRANSITIONING → ACTIVE for ${row.config_id} (${row.type}/${row.network})`,
        );
        await this.completeActivation(row.config_id, row.type, row.network, row.updated_by);
      } catch (e) {
        this.logger.error(`Cron flush failed for ${row.config_id}: ${(e as Error).message}`);
      }
    }
  }

  // ── Cache helpers ────────────────────────────────────────────────────────

  async invalidateCache(type: string, network: string): Promise<void> {
    const cacheKey = `${type}:${network}`;
    this.memCache.delete(cacheKey);
    const redisKey = `payment_config:${cacheKey}:active`;
    try {
      await this.redisService.del(redisKey);
    } catch {
      // non-critical
    }
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private decrypt(encrypted: string): PaymentGatewayConfig {
    const json = this.encryptionService.decrypt(encrypted);
    return JSON.parse(json) as PaymentGatewayConfig;
  }

  private async publishEvent(event: PaymentConfigEvent): Promise<void> {
    try {
      await this.redisService.publish(PAYMENT_CONFIG_EVENTS_CHANNEL, JSON.stringify(event));
    } catch (error) {
      this.logger.error('Failed to publish payment config event', error);
    }
  }
}
