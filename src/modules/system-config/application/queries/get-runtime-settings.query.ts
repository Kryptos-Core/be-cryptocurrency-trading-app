import { Inject, Injectable } from '@nestjs/common';
import type { ConfigCategory, ConfigDataType } from '@/entities/system-config.entity';
import {
  SYSTEM_CONFIG_REPOSITORY,
  type SystemConfigRepositoryPort,
} from '@/modules/system-config/domain/ports';
import {
  RUNTIME_SETTING_SEEDS,
} from '@/modules/system-config/runtime-settings.definitions';
import { SystemConfigService } from '@/modules/system-config/system-config.service';

export interface RuntimeSettingView {
  key: string;
  value: string;
  effectiveValue: string;
  valueSource: 'database' | 'environment';
  type: ConfigDataType;
  category: ConfigCategory;
  name: string;
  description?: string;
  isReadOnly: boolean;
}

/**
 * GetRuntimeSettingsQuery — admin-facing read model that merges DB rows with
 * environment/app-config fallbacks for all whitelisted runtime setting keys.
 */
@Injectable()
export class GetRuntimeSettingsQuery {
  constructor(
    @Inject(SYSTEM_CONFIG_REPOSITORY)
    private readonly configRepo: SystemConfigRepositoryPort,
    private readonly configService: SystemConfigService,
  ) {}

  /**
   * Returns runtime settings filtered by [category].
   * Pass `null` to get all categories (used by `/system-configs/runtime` without sub-path).
   */
  async execute(category?: ConfigCategory): Promise<RuntimeSettingView[]> {
    const nodeEnv = (process.env.NODE_ENV ?? '').toLowerCase();
    const allowUiTestSig = ['true', '1', 'yes', 'on'].includes(
      (process.env.ALLOW_UI_TEST_SIGNATURE ?? '').toLowerCase(),
    );

    const seeds =
      category !== undefined
        ? RUNTIME_SETTING_SEEDS.filter((s) => s.category === category)
        : RUNTIME_SETTING_SEEDS;

    const rows = await this.configRepo.find();
    const byKey = new Map(rows.map((r) => [r.key, r]));

    return seeds.map((seed) => {
      const row = byKey.get(seed.key);
      const envFallback = this.configService.resolveEnvFallback(seed.key);
      const effectiveValue = row?.value ?? envFallback;
      const testSigLocked =
        seed.key === 'BLOCKCHAIN_ALLOW_TEST_SIGNATURE' &&
        nodeEnv === 'production' &&
        !allowUiTestSig;
      return {
        key: seed.key,
        value: row?.value ?? envFallback,
        effectiveValue,
        valueSource: (row ? 'database' : 'environment') as 'database' | 'environment',
        type: seed.type,
        category: seed.category,
        name: seed.name,
        description: seed.description,
        isReadOnly: testSigLocked || (row?.isReadOnly ?? false),
      };
    });
  }
}
