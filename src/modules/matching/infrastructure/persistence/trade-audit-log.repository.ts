import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { TradeAuditLog } from '@/entities/trade-audit-log.entity';
import type { TradeAuditLogRepositoryPort } from '../../domain/ports';

/**
 * Infrastructure implementation of TradeAuditLogRepositoryPort.
 */
@Injectable()
export class TradeAuditLogRepository implements TradeAuditLogRepositoryPort {
  constructor(
    @InjectRepository(TradeAuditLog)
    private readonly repo: Repository<TradeAuditLog>,
  ) {}

  async save(record: Partial<TradeAuditLog>): Promise<void> {
    await this.repo.save(record);
  }
}
