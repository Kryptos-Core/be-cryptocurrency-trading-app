import { Injectable, Logger } from '@nestjs/common';
import { ITradeResultVisitor, TradeExecutionResult } from '../interfaces';

/**
 * Visitor Pattern: Audit log visitor for trade execution results.
 * Responsibility: persist an immutable audit record of every fill.
 * Decoupled from MatchingService—registered as an observer callback.
 */
@Injectable()
export class AuditTradeVisitor implements ITradeResultVisitor {
  private readonly logger = new Logger(AuditTradeVisitor.name);

  visit(trade: TradeExecutionResult): void {
    this.logger.log(
      `[AUDIT] trade=${trade.trade_id} pair=${trade.pair_id} ` +
        `price=${trade.price} amount=${trade.amount} ` +
        `maker=${trade.maker_order_id} taker=${trade.taker_order_id}`,
    );
  }
}
