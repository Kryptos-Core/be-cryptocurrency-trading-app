import { BadRequestException, Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  EVM_CHAIN_DEFINITIONS,
  getEvmDefinitionByTreasuryChain,
} from '@/common/constants/evm-chain-definitions';
import { RedisService } from '@/common/services';
import {
  type ConfigCategory,
  type ConfigDataType,
  SystemConfig,
} from '@/entities/system-config.entity';
import { SYSTEM_CONFIG_REPOSITORY, type SystemConfigRepositoryPort } from './domain/ports';
import {
  RUNTIME_SETTING_KEY_SET,
  RUNTIME_SETTING_SEEDS,
  type RuntimeSettingKey,
} from './runtime-settings.definitions';

@Injectable()
export class SystemConfigService implements OnModuleInit {
  private readonly logger = new Logger(SystemConfigService.name);
  private readonly REDIS_HASH_KEY = 'global:system_configs';
  private readonly UPDATE_EVENT = 'system_config.updated';

  constructor(
    @Inject(SYSTEM_CONFIG_REPOSITORY)
    private readonly configRepo: SystemConfigRepositoryPort,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async onModuleInit() {
    this.logger.log('Initializing system configs (runtime keys + Redis sync)...');
    const runner = this.configRepo.createQueryRunner();
    await runner.connect();
    try {
      if (!(await runner.hasTable('system_configs'))) {
        this.logger.error(
          'Table `system_configs` is missing. Run `npm run migration:run` (DB_* must be set in `.env.development`).',
        );
        this.subscribeToPubSub();
        return;
      }
    } finally {
      await runner.release();
    }
    try {
      await this.ensureRuntimeRows();
    } catch (err) {
      this.logger.warn(
        `ensureRuntimeRows failed — will retry on next request: ${(err as Error).message}`,
      );
    }
    await this.syncDbToRedis();
    this.subscribeToPubSub();
  }

  /** Bootstrap: insert any missing whitelisted rows using env/app defaults; sync category if stale. */
  private async ensureRuntimeRows() {
    for (const seed of RUNTIME_SETTING_SEEDS) {
      const exists = await this.configRepo.findOne({ where: { key: seed.key } });
      if (exists) {
        if (exists.category !== seed.category) {
          this.logger.log(
            `Syncing category for "${seed.key}": ${exists.category} → ${seed.category}`,
          );
          exists.category = seed.category;
          exists.name = seed.name;
          exists.description = seed.description;
          exists.type = seed.type;
          try {
            await this.configRepo.save(exists);
          } catch (err) {
            this.logger.warn(
              `Could not sync category for "${seed.key}" — enum may not include "${seed.category}" yet. Run migrations.`,
            );
          }
        }
        continue;
      }

      const value = this.resolveEnvFallback(seed.key);
      try {
        await this.configRepo.save({
          key: seed.key,
          value,
          type: seed.type,
          category: seed.category,
          name: seed.name,
          description: seed.description,
          isReadOnly: seed.isReadOnly ?? false,
        });
        this.logger.log(`Seeded runtime config key: ${seed.key}`);
      } catch (err) {
        this.logger.warn(
          `Could not seed key "${seed.key}" (category="${seed.category}"): ${(err as Error).message}. Run migrations first.`,
        );
      }
    }
  }

  private async syncDbToRedis() {
    const configs = await this.configRepo.find();
    if (configs.length === 0) {
      this.logger.warn('No system configs in DB yet.');
      return;
    }

    const cachePipeline = this.redisService.getClient().pipeline();
    cachePipeline.del(this.REDIS_HASH_KEY);

    configs.forEach((config) => {
      cachePipeline.hset(this.REDIS_HASH_KEY, config.key, config.value);
    });

    await cachePipeline.exec();
    this.logger.log(`Synced ${configs.length} configs to Redis`);
  }

  private subscribeToPubSub() {
    const subscriber = this.redisService.getSubscriber();
    if (subscriber) {
      subscriber.subscribe(this.UPDATE_EVENT, (err?: Error | null) => {
        if (err) {
          this.logger.error(`Failed to subscribe to ${this.UPDATE_EVENT}`, err.message);
        }
      });

      subscriber.on('message', async (channel: string, message: string) => {
        if (channel === this.UPDATE_EVENT) {
          try {
            const { key, value } = JSON.parse(message) as { key: string; value: string };
            this.logger.log(`[PubSub] system_config.updated: ${key}`);
            this.eventEmitter.emit('system_config_updated', { key, value });
          } catch {
            // ignore
          }
        }
      });
    }
  }

  private castValue(value: string, type: string): unknown {
    switch (type) {
      case 'int':
        return parseInt(value, 10);
      case 'float':
        return parseFloat(value);
      case 'bool':
        return value === 'true';
      default:
        return value;
    }
  }

  /**
   * Redis → DB → env/app fallback (for whitelisted runtime keys only).
   */
  async get<T = string>(key: string): Promise<T | null> {
    const cachedStr = await this.redisService.getClient().hget(this.REDIS_HASH_KEY, key);

    if (cachedStr !== null && cachedStr !== undefined) {
      return cachedStr as unknown as T;
    }

    const config = await this.configRepo.findOne({ where: { key } });
    if (config) {
      await this.redisService.getClient().hset(this.REDIS_HASH_KEY, key, config.value);
      return config.value as unknown as T;
    }

    if (RUNTIME_SETTING_KEY_SET.has(key)) {
      return this.resolveEnvFallback(key) as unknown as T;
    }

    return null;
  }

  async getTyped<T>(key: string, expectedType: ConfigDataType): Promise<T | null> {
    const raw = await this.get<string>(key);
    if (raw === null) return null;
    return this.castValue(raw, expectedType) as T;
  }

  /**
   * Effective string for a runtime key (never null for whitelisted keys).
   */
  async getEffectiveString(key: RuntimeSettingKey): Promise<string> {
    const v = await this.get<string>(key);
    return v ?? this.resolveEnvFallback(key);
  }

  /**
   * RPC URL for treasury EVM chain codes (POLYGON_MAINNET, …) from DB/env via `*_RPC_URL` keys.
   */
  async resolveEvmRpcUrlForTreasuryChain(treasuryChain: string): Promise<string> {
    const def = getEvmDefinitionByTreasuryChain(treasuryChain);
    if (!def) {
      throw new BadRequestException(
        `Not an EVM treasury chain: ${treasuryChain}`,
        'TREASURY_CHAIN_NOT_EVM',
      );
    }
    return this.getEffectiveString(def.rpcConfigKey as RuntimeSettingKey);
  }

  resolveEnvFallback(key: string): string {
    const app = (path: string, def: string | number): string => {
      const v = this.configService.get<string | number>(path);
      if (v === undefined || v === null || v === '') return String(def);
      return String(v);
    };

    const envOr = (k: string, def: string): string => {
      const v = process.env[k];
      if (v !== undefined && v !== '') return v.trim();
      return def;
    };

    switch (key as RuntimeSettingKey) {
      case 'WALLET_SYNC_INTERVAL':
        return app('app.wallet.syncInterval', 30000);
      case 'WALLET_RECONCILIATION_THRESHOLD':
        return app('app.wallet.reconciliationThreshold', '0.00000001');
      case 'TRON_MAINNET_FULL_HOST':
        return app('app.blockchain.tron.mainnetFullHost', 'https://api.trongrid.io');
      case 'SOLANA_MAINNET_URL':
        return app('app.blockchain.solana.mainnetUrl', 'https://api.mainnet-beta.solana.com');
      case 'ETH_MAINNET_RPC_URL':
        return app('app.blockchain.ethereum.mainnetRpcUrl', 'https://eth.llamarpc.com');
      case 'ETH_MAINNET_CHAIN_ID':
        return app('app.blockchain.ethereum.mainnetChainId', 1);
      case 'BSC_MAINNET_RPC_URL':
        return app('app.blockchain.bsc.mainnetRpcUrl', 'https://bsc-dataseed.binance.org');
      case 'BSC_MAINNET_CHAIN_ID':
        return app('app.blockchain.bsc.mainnetChainId', 56);
      case 'BLOCKCHAIN_ALLOW_TEST_SIGNATURE': {
        const a = (process.env.BLOCKCHAIN_ALLOW_TEST_SIGNATURE || '').toLowerCase();
        return ['true', '1', 'yes', 'on'].includes(a) ? 'true' : 'false';
      }
      case 'BLOCKCHAIN_WITHDRAW_AUTO_MAX':
        return envOr('BLOCKCHAIN_WITHDRAW_AUTO_MAX', '0');
      case 'BLOCKCHAIN_WITHDRAW_AUTO_MAX_ETH_MAINNET':
        return envOr(
          'BLOCKCHAIN_WITHDRAW_AUTO_MAX_ETH_MAINNET',
          envOr('BLOCKCHAIN_WITHDRAW_AUTO_MAX', '0'),
        );
      case 'BLOCKCHAIN_WITHDRAW_AUTO_MAX_BSC_MAINNET':
        return envOr(
          'BLOCKCHAIN_WITHDRAW_AUTO_MAX_BSC_MAINNET',
          envOr('BLOCKCHAIN_WITHDRAW_AUTO_MAX', '0'),
        );
      case 'BLOCKCHAIN_WITHDRAW_AUTO_MAX_SOLANA_MAINNET':
        return envOr(
          'BLOCKCHAIN_WITHDRAW_AUTO_MAX_SOLANA_MAINNET',
          envOr('BLOCKCHAIN_WITHDRAW_AUTO_MAX', '0'),
        );
      case 'BLOCKCHAIN_WITHDRAW_AUTO_MAX_TRON_MAINNET':
        return envOr(
          'BLOCKCHAIN_WITHDRAW_AUTO_MAX_TRON_MAINNET',
          envOr('BLOCKCHAIN_WITHDRAW_AUTO_MAX', '0'),
        );
      case 'BLOCKCHAIN_WITHDRAW_ETH_SYMBOL':
        return envOr('BLOCKCHAIN_WITHDRAW_ETH_SYMBOL', 'ETH');
      case 'BLOCKCHAIN_WITHDRAW_BNB_SYMBOL':
        return envOr('BLOCKCHAIN_WITHDRAW_BNB_SYMBOL', 'BNB');
      case 'BLOCKCHAIN_WITHDRAW_SOL_SYMBOL':
        return envOr('BLOCKCHAIN_WITHDRAW_SOL_SYMBOL', 'SOL');
      case 'BLOCKCHAIN_WITHDRAW_TRON_SYMBOL':
        return envOr('BLOCKCHAIN_WITHDRAW_TRON_SYMBOL', 'TRX');
      case 'BLOCKCHAIN_WITHDRAW_POL_SYMBOL':
        return envOr('BLOCKCHAIN_WITHDRAW_POL_SYMBOL', 'POL');
      case 'BLOCKCHAIN_WITHDRAW_AVAX_SYMBOL':
        return envOr('BLOCKCHAIN_WITHDRAW_AVAX_SYMBOL', 'AVAX');
      case 'BLOCKCHAIN_WITHDRAW_XDAI_SYMBOL':
        return envOr('BLOCKCHAIN_WITHDRAW_XDAI_SYMBOL', 'XDAI');
      case 'BLOCKCHAIN_WITHDRAW_FTM_SYMBOL':
        return envOr('BLOCKCHAIN_WITHDRAW_FTM_SYMBOL', 'FTM');
      case 'PLATFORM_CASH_CURRENCY_SYMBOL': {
        const p = process.env.PLATFORM_CASH_CURRENCY_SYMBOL?.trim();
        if (p) return p;
        const payos = process.env.PAYOS_DEPOSIT_CURRENCY_SYMBOL?.trim();
        return payos || 'USDT';
      }
      case 'BLOCKCHAIN_DEPOSIT_TRX_TO_USDT_RATE':
        return envOr('BLOCKCHAIN_DEPOSIT_TRX_TO_USDT_RATE', '0');
      case 'BLOCKCHAIN_DEPOSIT_ETH_TO_USDT_RATE':
        return envOr('BLOCKCHAIN_DEPOSIT_ETH_TO_USDT_RATE', '0');
      case 'BLOCKCHAIN_DEPOSIT_SOL_TO_USDT_RATE':
        return envOr('BLOCKCHAIN_DEPOSIT_SOL_TO_USDT_RATE', '0');
      case 'BLOCKCHAIN_DEPOSIT_POL_TO_USDT_RATE':
        return envOr('BLOCKCHAIN_DEPOSIT_POL_TO_USDT_RATE', '0');
      case 'BLOCKCHAIN_DEPOSIT_AVAX_TO_USDT_RATE':
        return envOr('BLOCKCHAIN_DEPOSIT_AVAX_TO_USDT_RATE', '0');
      case 'BLOCKCHAIN_DEPOSIT_XDAI_TO_USDT_RATE':
        return envOr('BLOCKCHAIN_DEPOSIT_XDAI_TO_USDT_RATE', '0');
      case 'BLOCKCHAIN_DEPOSIT_FTM_TO_USDT_RATE':
        return envOr('BLOCKCHAIN_DEPOSIT_FTM_TO_USDT_RATE', '0');
      case 'MM_DEFAULT_SPREAD_BPS':
        return envOr('MM_DEFAULT_SPREAD_BPS', '10');
      case 'MM_DEFAULT_SPREAD_ALERT_THRESHOLD_BPS':
        return envOr('MM_DEFAULT_SPREAD_ALERT_THRESHOLD_BPS', '20');
      case 'MM_DEFAULT_ORDER_AMOUNT':
        return envOr('MM_DEFAULT_ORDER_AMOUNT', '0.001');
      case 'MARKET_READ_SOURCE':
        return envOr('MARKET_READ_SOURCE', 'postgres');
      case 'TICKER_SOURCE':
        return envOr('TICKER_SOURCE', 'nestjs');
      case 'MATCHING_ENGINE':
        return envOr('MATCHING_ENGINE', 'ts');
      case 'MATCHING_GO_CANARY_PAIRS':
        return envOr('MATCHING_GO_CANARY_PAIRS', '');
      case 'PUBLIC_WS_SOURCE':
        return envOr('PUBLIC_WS_SOURCE', 'nestjs');
      case 'GO_AGGREGATOR_TICKER_CHANNEL':
        return envOr('GO_AGGREGATOR_TICKER_CHANNEL', 'trading:external:ticker');
      case 'GO_AGGREGATOR_OHLC_CHANNEL':
        return envOr('GO_AGGREGATOR_OHLC_CHANNEL', 'trading:external:ohlc');
      case 'MATCHING_SHADOW_MONITOR_PAIRS':
        return envOr('MATCHING_SHADOW_MONITOR_PAIRS', envOr('MATCHING_GO_CANARY_PAIRS', ''));
      case 'MATCHING_SHADOW_ALERT_MIN_MATCH_RATE_PERCENT':
        return envOr('MATCHING_SHADOW_ALERT_MIN_MATCH_RATE_PERCENT', '99.9');
      case 'MATCHING_SHADOW_ALERT_MAX_UNMATCHED_RUNS':
        return envOr('MATCHING_SHADOW_ALERT_MAX_UNMATCHED_RUNS', '0');
      case 'GO_ROLLOUT_WINDOW_HOURS':
        return envOr('GO_ROLLOUT_WINDOW_HOURS', '24');
      case 'GO_ROLLOUT_MAX_PUBLIC_WS_DRIFT_PAIRS':
        return envOr('GO_ROLLOUT_MAX_PUBLIC_WS_DRIFT_PAIRS', '0');
      case 'EVENT_OUTBOX_ALERT_MAX_DEAD_LETTER_ROWS':
        return envOr('EVENT_OUTBOX_ALERT_MAX_DEAD_LETTER_ROWS', '0');
      case 'EVENT_OUTBOX_ALERT_MAX_OLDEST_UNPUBLISHED_AGE_SECONDS':
        return envOr('EVENT_OUTBOX_ALERT_MAX_OLDEST_UNPUBLISHED_AGE_SECONDS', '300');
      case 'EVENT_OUTBOX_ALERT_MAX_OLDEST_DEAD_LETTER_AGE_SECONDS':
        return envOr('EVENT_OUTBOX_ALERT_MAX_OLDEST_DEAD_LETTER_AGE_SECONDS', '60');
      case 'EVENT_OUTBOX_ALERT_CRITICAL_MAX_DEAD_LETTER_ROWS':
        return envOr('EVENT_OUTBOX_ALERT_CRITICAL_MAX_DEAD_LETTER_ROWS', '10');
      case 'EVENT_OUTBOX_ALERT_CRITICAL_MAX_OLDEST_UNPUBLISHED_AGE_SECONDS':
        return envOr('EVENT_OUTBOX_ALERT_CRITICAL_MAX_OLDEST_UNPUBLISHED_AGE_SECONDS', '1800');
      case 'EVENT_OUTBOX_ALERT_CRITICAL_MAX_OLDEST_DEAD_LETTER_AGE_SECONDS':
        return envOr('EVENT_OUTBOX_ALERT_CRITICAL_MAX_OLDEST_DEAD_LETTER_AGE_SECONDS', '600');
      case 'EVENT_OUTBOX_ALERT_AUTOMATION_ENABLED':
        return envOr('EVENT_OUTBOX_ALERT_AUTOMATION_ENABLED', 'true');
      case 'EVENT_OUTBOX_ALERTS_CHANNEL':
        return envOr('EVENT_OUTBOX_ALERTS_CHANNEL', 'outbox:alerts');
      case 'MARKET_READ_MODEL_ALERT_MAX_LAG_SECONDS':
        return envOr('MARKET_READ_MODEL_ALERT_MAX_LAG_SECONDS', '300');
      case 'MARKET_READ_MODEL_ALERT_CRITICAL_MAX_LAG_SECONDS':
        return envOr('MARKET_READ_MODEL_ALERT_CRITICAL_MAX_LAG_SECONDS', '900');
      case 'GO_ROLLOUT_MIN_PUBLIC_WS_COMPARED_PAIRS':
        return envOr('GO_ROLLOUT_MIN_PUBLIC_WS_COMPARED_PAIRS', '1');
      case 'GO_ROLLOUT_ROLLBACK_DRILL_MAX_AGE_HOURS':
        return envOr('GO_ROLLOUT_ROLLBACK_DRILL_MAX_AGE_HOURS', '72');
      case 'BLOCKCHAIN_WITHDRAW_AUTO_MIN_AMOUNT':
        return envOr('BLOCKCHAIN_WITHDRAW_AUTO_MIN_AMOUNT', '0');
      case 'BLOCKCHAIN_DEPOSIT_BSC_TO_USDT_RATE':
        return envOr('BLOCKCHAIN_DEPOSIT_BSC_TO_USDT_RATE', '0');
      default: {
        const rpcDef = EVM_CHAIN_DEFINITIONS.find((d) => d.rpcConfigKey === key);
        if (rpcDef) {
          return envOr(key, rpcDef.defaultRpcUrl);
        }
        if (key.startsWith('BLOCKCHAIN_WITHDRAW_AUTO_MAX_')) {
          return envOr(key, envOr('BLOCKCHAIN_WITHDRAW_AUTO_MAX', '0'));
        }
        if (/^BLOCKCHAIN_DEPOSIT_[A-Z0-9]+_TO_USDT_RATE$/.test(key)) {
          return envOr(key, '0');
        }
        // PHAN 3: Fraud config keys
        if (key === 'fraud.withdrawal_daily_limit_usd') return envOr('FRAUD_WITHDRAWAL_DAILY_LIMIT_USD', '50000');
        if (key === 'fraud.recent_wallet_link_hours') return envOr('FRAUD_RECENT_WALLET_LINK_HOURS', '24');
        if (key === 'fraud.high_amount_threshold_usd') return envOr('FRAUD_HIGH_AMOUNT_THRESHOLD_USD', '10000');
        // PHAN 4: Trading price manipulation keys
        if (key === 'trading.max_slippage_pct') return envOr('TRADING_MAX_SLIPPAGE_PCT', '0.01');
        if (key === 'trading.price_stale_threshold_ms') return envOr('TRADING_PRICE_STALE_THRESHOLD_MS', '300000');
        return '';
      }
    }
  }

  async getAllConfigs(): Promise<SystemConfig[]> {
    return this.configRepo.find({ order: { category: 'ASC', name: 'ASC' } });
  }

  /**
   * Admin UI: all runtime definitions with DB row + effective value + source hint.
   */
  async getRuntimeSettingsForAdmin(): Promise<
    Array<{
      key: string;
      value: string;
      effectiveValue: string;
      valueSource: 'database' | 'environment';
      type: ConfigDataType;
      category: ConfigCategory;
      name: string;
      description?: string;
      isReadOnly: boolean;
    }>
  > {
    const rows = await this.configRepo.find();
    const byKey = new Map(rows.map((r) => [r.key, r]));
    const nodeEnv = (process.env.NODE_ENV || '').toLowerCase();
    const allowUiTestSig = ['true', '1', 'yes', 'on'].includes(
      (process.env.ALLOW_UI_TEST_SIGNATURE || '').toLowerCase(),
    );

    return RUNTIME_SETTING_SEEDS.map((seed) => {
      const row = byKey.get(seed.key);
      const envFallback = this.resolveEnvFallback(seed.key);
      const effectiveValue = row?.value ?? envFallback;
      const testSigLocked =
        seed.key === 'BLOCKCHAIN_ALLOW_TEST_SIGNATURE' &&
        nodeEnv === 'production' &&
        !allowUiTestSig;
      return {
        key: seed.key,
        value: row?.value ?? envFallback,
        effectiveValue,
        valueSource: row ? 'database' : 'environment',
        type: row?.type ?? seed.type,
        category: row?.category ?? seed.category,
        name: row?.name ?? seed.name,
        description: row?.description ?? seed.description,
        isReadOnly: testSigLocked || row?.isReadOnly || seed.isReadOnly || false,
      };
    });
  }

  private assertCanEditTestSignatureInProduction(): void {
    const nodeEnv = (process.env.NODE_ENV || '').toLowerCase();
    if (nodeEnv !== 'production') return;
    const allowUi = ['true', '1', 'yes', 'on'].includes(
      (process.env.ALLOW_UI_TEST_SIGNATURE || '').toLowerCase(),
    );
    if (!allowUi) {
      throw new BadRequestException(
        'Editing BLOCKCHAIN_ALLOW_TEST_SIGNATURE in production requires ALLOW_UI_TEST_SIGNATURE=true on the server.',
      );
    }
  }

  private assertRuntimeKey(key: string): asserts key is RuntimeSettingKey {
    if (!RUNTIME_SETTING_KEY_SET.has(key)) {
      throw new BadRequestException(`Unknown or disallowed config key: ${key}`);
    }
  }

  async updateConfig(key: string, newValue: string, userId?: string): Promise<SystemConfig> {
    this.assertRuntimeKey(key);
    if (key === 'BLOCKCHAIN_ALLOW_TEST_SIGNATURE') {
      this.assertCanEditTestSignatureInProduction();
    }

    const config = await this.configRepo.findOne({ where: { key } });
    if (!config) {
      throw new BadRequestException(
        `Config key ${key} not found. Restart server to seed runtime keys.`,
      );
    }

    if (config.isReadOnly) {
      throw new BadRequestException(`Config ${key} is read-only.`);
    }

    config.value = newValue;
    const updated = await this.configRepo.save(config);

    await this.redisService.getClient().hset(this.REDIS_HASH_KEY, key, newValue);
    await this.redisService
      .getClient()
      .publish(this.UPDATE_EVENT, JSON.stringify({ key, value: newValue }));

    this.logUpdate(key, userId);

    return updated;
  }

  /** Structured audit log line — can be called from use-cases too. */
  logUpdate(key: string, userId?: string): void {
    this.logger.log(
      JSON.stringify({
        event: 'runtime_setting_updated',
        key,
        userId: userId ?? 'unknown',
        at: new Date().toISOString(),
      }),
    );
  }

  async updateConfigsBulk(
    updates: Record<string, string>,
    userId?: string,
  ): Promise<{ updated: string[] }> {
    const keys = Object.keys(updates);
    if (keys.length === 0) {
      return { updated: [] };
    }

    for (const k of keys) {
      this.assertRuntimeKey(k);
      const val = updates[k];
      if (val === undefined || typeof val !== 'string') {
        throw new BadRequestException(`Invalid value for key ${k}: must be a string`);
      }
    }

    const updatedKeys: string[] = [];
    for (const [key, value] of Object.entries(updates)) {
      await this.updateConfig(key, String(value), userId);
      updatedKeys.push(key);
    }

    return { updated: updatedKeys };
  }

  async seedInitialConfig(items: Partial<SystemConfig>[]) {
    this.logger.log('Seeding initial system configurations...');
    for (const item of items) {
      if (!item.key) continue;
      const exists = await this.configRepo.findOne({ where: { key: item.key } });
      if (!exists) {
        await this.configRepo.save(item as SystemConfig);
      }
    }
    await this.syncDbToRedis();
  }
}
