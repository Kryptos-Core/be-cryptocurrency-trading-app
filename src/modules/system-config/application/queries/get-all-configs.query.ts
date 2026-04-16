import { Inject, Injectable } from '@nestjs/common';
import type { SystemConfig } from '@/entities/system-config.entity';
import {
  SYSTEM_CONFIG_REPOSITORY,
  type SystemConfigRepositoryPort,
} from '@/modules/system-config/domain/ports';

/** Returns all raw system_config rows from DB, sorted by category and name. */
@Injectable()
export class GetAllConfigsQuery {
  constructor(
    @Inject(SYSTEM_CONFIG_REPOSITORY)
    private readonly configRepo: SystemConfigRepositoryPort,
  ) {}

  async execute(): Promise<SystemConfig[]> {
    return this.configRepo.find({ order: { category: 'ASC', name: 'ASC' } });
  }
}
