import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { QueryRunner, Repository } from 'typeorm';
import { SystemConfig } from '@/entities/system-config.entity';
import type { SystemConfigRepositoryPort } from '../../domain/ports/system-config-repository.port';

@Injectable()
export class SystemConfigRepositoryImpl implements SystemConfigRepositoryPort {
  constructor(
    @InjectRepository(SystemConfig)
    private readonly repository: Repository<SystemConfig>,
  ) {}

  async findOne(options: { where: { key: string } }): Promise<SystemConfig | null> {
    return this.repository.findOne(options);
  }

  async find(options?: { order?: Record<string, 'ASC' | 'DESC'> }): Promise<SystemConfig[]> {
    return this.repository.find(options);
  }

  async save(config: Partial<SystemConfig>): Promise<SystemConfig> {
    return this.repository.save(config);
  }

  createQueryRunner(): QueryRunner {
    return this.repository.manager.connection.createQueryRunner();
  }
}
