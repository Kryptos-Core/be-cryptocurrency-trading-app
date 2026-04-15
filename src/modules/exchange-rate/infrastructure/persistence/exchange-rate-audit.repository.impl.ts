import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { ExchangeRateAuditLog } from '@/entities/exchange-rate-audit-log.entity';
import type { ExchangeRateAuditRepositoryPort } from '../../domain/ports/exchange-rate-audit-repository.port';

@Injectable()
export class ExchangeRateAuditRepositoryImpl implements ExchangeRateAuditRepositoryPort {
  constructor(
    @InjectRepository(ExchangeRateAuditLog)
    private readonly repository: Repository<ExchangeRateAuditLog>,
  ) {}

  async save(audit: Partial<ExchangeRateAuditLog>): Promise<ExchangeRateAuditLog> {
    return this.repository.save(audit);
  }

  async findLatest(limit: number): Promise<ExchangeRateAuditLog[]> {
    return this.repository.find({
      order: { created_at: 'DESC' },
      take: limit,
    });
  }
}
