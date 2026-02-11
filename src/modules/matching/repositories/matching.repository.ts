import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { OrderBookOrder } from '../interfaces';

export interface TradeExecuteResult {
  trade_id: number | null;
  error_code: string | null;
  error_message: string | null;
}

/**
 * Matching Repository (Database Procedure Pattern)
 * sp_orders_open_for_pair, sp_trade_execute
 */
@Injectable()
export class MatchingRepository {
  constructor(private readonly dataSource: DataSource) {}

  async getOpenOrdersForPair(
    pairId: number,
    side: 'BUY' | 'SELL',
  ): Promise<OrderBookOrder[]> {
    const result = await this.dataSource.query(
      'CALL sp_orders_open_for_pair(?, ?)',
      [pairId, side],
    );
    const rows = result?.[0] ?? [];
    return rows.map((r: any) => this.mapRowToOrderBookOrder(r));
  }

  async executeTrade(params: {
    pairId: number;
    makerOrderId: number;
    takerOrderId: number;
    price: string;
    amount: string;
    feeCurrencyId: number;
    takerFee: string;
    makerFee: string;
  }): Promise<TradeExecuteResult> {
    await this.dataSource.query(
      'CALL sp_trade_execute(?, ?, ?, ?, ?, ?, ?, ?, @p_trade_id, @p_error_code, @p_error_message)',
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
    const [out] = await this.dataSource.query(
      'SELECT @p_trade_id AS trade_id, @p_error_code AS error_code, @p_error_message AS error_message',
    );
    return {
      trade_id: out?.trade_id ?? null,
      error_code: out?.error_code ?? null,
      error_message: out?.error_message ?? null,
    };
  }

  private mapRowToOrderBookOrder(r: any): OrderBookOrder {
    const amount = parseFloat(r.amount ?? '0');
    const filled = parseFloat(r.filled_amount ?? '0');
    return {
      order_id: Number(r.order_id),
      pair_id: Number(r.pair_id),
      user_id: Number(r.user_id),
      side: r.side,
      type: r.type,
      price: r.price != null ? String(r.price) : null,
      amount: String(r.amount ?? '0'),
      filled_amount: String(r.filled_amount ?? '0'),
      status: r.status ?? 'OPEN',
      created_at: r.created_at,
      remaining: String(amount - filled),
    };
  }
}
