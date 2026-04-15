import type { QueryRunner } from 'typeorm';
import type { SystemConfig } from '@/entities/system-config.entity';

export interface SystemConfigRepositoryPort {
  findOne(options: { where: { key: string } }): Promise<SystemConfig | null>;
  find(options?: { order?: Record<string, 'ASC' | 'DESC'> }): Promise<SystemConfig[]>;
  save(config: Partial<SystemConfig>): Promise<SystemConfig>;
  createQueryRunner(): QueryRunner;
}
