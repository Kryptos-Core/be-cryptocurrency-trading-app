import { Injectable, Logger } from '@nestjs/common';
import { ITradeResultVisitor, TradeExecutionResult } from '../interfaces';
import { TradeAuditLogRepository } from './trade-audit-log.repository';

/**
 * Visitor Pattern: Audit log visitor for trade execution results.
 * Responsibility: persist an immutable audit record of every fill to trade_audit_log.
 * Decoupled from MatchingService—registered as an observer callback.
 */
@Injectable()
export class AuditTradeVisitor implements ITradeResultVisitor {
  private readonly logger = new Logger(AuditTradeVisitor.name);

  constructor(private readonly auditLogRepository: TradeAuditLogRepository) {}

  async visit(trade: TradeExecutionResult): Promise<void> {
    try {
      await this.auditLogRepository.save({
        trade_id: trade.trade_id,
        pair_id: trade.pair_id,
        maker_order_id: trade.maker_order_id,
        taker_order_id: trade.taker_order_id,
        price: trade.price,
        amount: trade.amount,
        taker_fee: trade.taker_fee,
        maker_fee: trade.maker_fee,
        fee_currency_id: trade.fee_currency_id,
      });
    } catch (e) {
      this.logger.error(
        `[AUDIT] Failed to persist audit record for trade ${trade.trade_id}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
}
