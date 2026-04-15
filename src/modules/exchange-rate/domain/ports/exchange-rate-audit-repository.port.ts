import type { ExchangeRateAuditLog } from '@/entities/exchange-rate-audit-log.entity';

export interface ExchangeRateAuditRepositoryPort {
  save(audit: Partial<ExchangeRateAuditLog>): Promise<ExchangeRateAuditLog>;
  findLatest(limit: number): Promise<ExchangeRateAuditLog[]>;
}
