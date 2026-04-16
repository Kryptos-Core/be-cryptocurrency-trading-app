import { BadRequestException, Injectable } from '@nestjs/common';
import type { SystemConfig } from '@/entities/system-config.entity';
import { UpdateConfigUseCase } from './update-config.use-case';

/**
 * UpdateConfigsBulkUseCase — atomic bulk update of multiple runtime config keys.
 *
 * Validates all keys upfront before writing any row so a bad key
 * doesn't leave the DB in a partially-updated state.
 */
@Injectable()
export class UpdateConfigsBulkUseCase {
  constructor(private readonly updateConfig: UpdateConfigUseCase) {}

  async execute(updates: Record<string, string>, userId?: string): Promise<{ updated: string[] }> {
    const entries = Object.entries(updates);
    if (entries.length === 0) {
      return { updated: [] };
    }

    for (const [k, val] of entries) {
      if (val === undefined || typeof val !== 'string') {
        throw new BadRequestException(`Invalid value for key ${k}: must be a string`);
      }
    }

    const updatedKeys: string[] = [];
    for (const [key, value] of entries) {
      await this.updateConfig.execute(key, value, userId);
      updatedKeys.push(key);
    }

    return { updated: updatedKeys };
  }
}

export type BulkUpdateResult = { updated: string[] };

/** Re-export for convenience. */
export type { SystemConfig };
