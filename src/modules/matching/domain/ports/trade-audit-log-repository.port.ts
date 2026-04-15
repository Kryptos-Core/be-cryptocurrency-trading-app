import type { TradeAuditLog } from '@/entities/trade-audit-log.entity';

/**
 * Port: Trade audit log repository abstraction.
 * Visitors depend on this interface; infrastructure provides the implementation.
 */
export interface TradeAuditLogRepositoryPort {
  save(record: Partial<TradeAuditLog>): Promise<void>;
}
