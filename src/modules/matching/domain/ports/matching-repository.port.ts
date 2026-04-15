import type { OrderBookOrder } from '../../interfaces';

/**
 * Port: Matching repository abstraction.
 * Domain/application depends on this interface; infrastructure provides the implementation.
 */
export interface MatchingRepositoryPort {
  getOpenOrdersForPair(pairId: string, side: 'BUY' | 'SELL'): Promise<OrderBookOrder[]>;

  executeTrade(params: {
    pairId: string;
    makerOrderId: string;
    takerOrderId: string;
    price: string;
    amount: string;
    feeCurrencyId: string;
    takerFee: string;
    makerFee: string;
  }): Promise<TradeExecuteResult>;

  cancelIocRemainder(orderId: string, userId: string): Promise<void>;
}

export interface TradeExecuteResult {
  trade_id: string | null;
  error_code: string | null;
  error_message: string | null;
}
