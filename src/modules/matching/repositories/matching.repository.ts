import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { MATCHING_STORE_PROCEDURE } from '@/common/constants/stored-procedure-names';
import { selectMysqlUserVars } from '@/common/database/mysql-procedure-out-vars';
import type { MatchingRepositoryPort, TradeExecuteResult } from '../domain/ports';
import type { OrderBookOrder } from '../interfaces';

/**
 * Matching Repository (Database Procedure Pattern)
 * Infrastructure implementation of MatchingRepositoryPort.
 * sp_orders_open_for_pair, sp_trade_execute
 */
@Injectable()
export class MatchingRepository implements MatchingRepositoryPort {
  private readonly logger = new Logger(MatchingRepository.name);

  constructor(private readonly dataSource: DataSource) {}

  async getOpenOrdersForPair(pairId: string, side: 'BUY' | 'SELL'): Promise<OrderBookOrder[]> {
    const result = await this.dataSource.query(
      `CALL ${MATCHING_STORE_PROCEDURE.ORDERS_OPEN_FOR_PAIR}(?, ?)`,
      [pairId, side],
    );
    const rows = result?.[0] ?? [];
    return rows.map((r: any) => this.mapRowToOrderBookOrder(r));
  }

  async executeTrade(params: {
    pairId: string;
    makerOrderId: string;
    takerOrderId: string;
    price: string;
    amount: string;
    feeCurrencyId: string;
    takerFee: string;
    makerFee: string;
  }): Promise<TradeExecuteResult> {
    await this.dataSource.query(
      `CALL ${MATCHING_STORE_PROCEDURE.TRADE_EXECUTE}(?, ?, ?, ?, ?, ?, ?, ?, @p_trade_id, @p_error_code, @p_error_message)`,
      [
        params.pairId,
        params.makerOrderId,
        params.takerOrderId,
        params.price,
        params.amount,
        params.feeCurrencyId,
        params.takerFee,
        params.makerFee,
      ],
    );
    const out = await selectMysqlUserVars(this.dataSource, {
      trade_id: 'p_trade_id',
      error_code: 'p_error_code',
      error_message: 'p_error_message',
    });
    return {
      trade_id: (out.trade_id as string | null | undefined) ?? null,
      error_code: (out.error_code as string | null | undefined) ?? null,
      error_message: (out.error_message as string | null | undefined) ?? null,
    };
  }

  async cancelIocRemainder(orderId: string, userId: string): Promise<void> {
    await this.dataSource.query(
      `CALL ${MATCHING_STORE_PROCEDURE.ORDER_CANCEL}(?, ?, @p_cancelled, @p_error_code, @p_error_message)`,
      [orderId, userId],
    );
    const out = await selectMysqlUserVars(this.dataSource, {
      cancelled: 'p_cancelled',
      error_code: 'p_error_code',
      error_message: 'p_error_message',
    });
    if (!out?.cancelled) {
      this.logger.warn(
        `cancelIocRemainder noop for ${orderId}: ${out?.error_code ?? 'UNKNOWN'} — ${out?.error_message ?? ''}`,
      );
    }
  }

  private mapRowToOrderBookOrder(r: any): OrderBookOrder {
    const amount = parseFloat(r.amount ?? '0');
    const filled = parseFloat(r.filled_amount ?? '0');
    return {
      order_id: String(r.order_id ?? '').trim(),
      pair_id: String(r.pair_id ?? '').trim(),
      user_id: String(r.user_id ?? '').trim(),
      side: String(r.side ?? '')
        .trim()
        .toUpperCase() as 'BUY' | 'SELL',
      type: String(r.type ?? '')
        .trim()
        .toUpperCase() as 'LIMIT' | 'MARKET',
      time_in_force: r.time_in_force ?? 'GTC',
      price: r.price != null ? String(r.price) : null,
      amount: String(r.amount ?? '0'),
      filled_amount: String(r.filled_amount ?? '0'),
      status: r.status ?? 'OPEN',
      created_at: r.created_at,
      remaining: String(amount - filled),
      slippage_tolerance: r.slippage_tolerance != null ? String(r.slippage_tolerance) : null,
    };
  }
}
