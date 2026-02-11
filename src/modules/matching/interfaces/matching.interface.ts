/**
 * Order snapshot for order book (Queue Pattern).
 * Immutable view for matching.
 */
export interface OrderBookOrder {
  order_id: number;
  pair_id: number;
  user_id: number;
  side: 'BUY' | 'SELL';
  type: 'LIMIT' | 'MARKET';
  price: string | null;
  amount: string;
  filled_amount: string;
  status: string;
  created_at: Date;
  /** amount - filled_amount */
  remaining: string;
}

/**
 * Result of one trade execution (Observer / Event payload).
 */
export interface TradeExecutionResult {
  trade_id: number;
  pair_id: number;
  maker_order_id: number;
  taker_order_id: number;
  price: string;
  amount: string;
  taker_fee: string;
  maker_fee: string;
  fee_currency_id: number;
  created_at: Date;
}

/**
 * Context passed to matching strategy (Strategy Pattern).
 */
export interface MatchingContext {
  pairId: number;
  takerOrder: OrderBookOrder;
  /** Fee currency (e.g. quote_currency_id) */
  feeCurrencyId: number;
  makerFeeRate: string;
  takerFeeRate: string;
}

/**
 * Executor called by strategy for each fill (Strategy + Dependency Injection).
 */
export type TradeExecutor = (
  makerOrder: OrderBookOrder,
  fillAmount: string,
  price: string,
) => Promise<TradeExecutionResult | null>;

/**
 * Strategy Pattern: matching strategy contract.
 */
export interface IMatchingStrategy {
  /**
   * Run matching for one taker order; calls executor for each fill, returns executed trade results.
   */
  match(
    context: MatchingContext,
    orderBook: {
      peekBestMaker: (pairId: number, side: 'BUY' | 'SELL') => OrderBookOrder | null;
      popBestMaker: (pairId: number, side: 'BUY' | 'SELL') => OrderBookOrder | null;
      addOrder: (order: OrderBookOrder) => void;
    },
    executeTrade: TradeExecutor,
  ): Promise<TradeExecutionResult[]>;
}

/**
 * Queue Pattern: order queue contract (price-time priority).
 */
export interface IOrderQueue {
  add(order: OrderBookOrder): void;
  remove(orderId: number): boolean;
  peekBest(): OrderBookOrder | null;
  popBest(): OrderBookOrder | null;
  size(): number;
  getAll(): OrderBookOrder[];
}
