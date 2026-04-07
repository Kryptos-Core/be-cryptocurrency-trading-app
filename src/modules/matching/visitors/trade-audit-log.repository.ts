import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TradeAuditLog } from '@/entities/trade-audit-log.entity';

@Injectable()
export class TradeAuditLogRepository {
  constructor(
    @InjectRepository(TradeAuditLog)
    private readonly repo: Repository<TradeAuditLog>,
  ) {}

  async save(record: Partial<TradeAuditLog>): Promise<void> {
    await this.repo.save(record);
  }
}
