import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { RedisService } from '@/common/services/redis.service';
import type { SystemConfig } from '@/entities/system-config.entity';
import {
  SYSTEM_CONFIG_REPOSITORY,
  type SystemConfigRepositoryPort,
} from '@/modules/system-config/domain/ports';
import { RUNTIME_SETTING_KEY_SET } from '@/modules/system-config/runtime-settings.definitions';
import { SystemConfigService } from '@/modules/system-config/system-config.service';

const REDIS_HASH_KEY = 'global:system_configs';
const UPDATE_EVENT = 'system_config.updated';

/**
 * UpdateConfigUseCase — single-key runtime config update.
 *
 * Guards:
 *  - Key must be whitelisted in RUNTIME_SETTING_KEY_SET.
 *  - BLOCKCHAIN_ALLOW_TEST_SIGNATURE may only be changed in non-production environments
 *    (unless ALLOW_UI_TEST_SIGNATURE=true is set on the server).
 *  - Read-only rows are rejected.
 *
 * Side-effects:
 *  - Persists new value to DB.
 *  - Updates Redis hash cache.
 *  - Publishes system_config.updated to Redis pub/sub (fans out to all API instances).
 */
@Injectable()
export class UpdateConfigUseCase {
  constructor(
    @Inject(SYSTEM_CONFIG_REPOSITORY)
    private readonly configRepo: SystemConfigRepositoryPort,
    private readonly redisService: RedisService,
    private readonly configService: SystemConfigService,
  ) {}

  async execute(key: string, newValue: string, userId?: string): Promise<SystemConfig> {
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

    await this.redisService.getClient().hset(REDIS_HASH_KEY, key, newValue);
    await this.redisService
      .getClient()
      .publish(UPDATE_EVENT, JSON.stringify({ key, value: newValue }));

    // Delegate structured audit log to the service (keeps logger context there)
    this.configService.logUpdate(key, userId);

    return updated;
  }

  private assertRuntimeKey(key: string): void {
    if (!RUNTIME_SETTING_KEY_SET.has(key)) {
      throw new BadRequestException(`Unknown or disallowed config key: ${key}`);
    }
  }

  private assertCanEditTestSignatureInProduction(): void {
    const nodeEnv = (process.env.NODE_ENV ?? '').toLowerCase();
    if (nodeEnv !== 'production') return;
    const allowUi = ['true', '1', 'yes', 'on'].includes(
      (process.env.ALLOW_UI_TEST_SIGNATURE ?? '').toLowerCase(),
    );
    if (!allowUi) {
      throw new BadRequestException(
        'Editing BLOCKCHAIN_ALLOW_TEST_SIGNATURE in production requires ALLOW_UI_TEST_SIGNATURE=true on the server.',
      );
    }
  }
}
