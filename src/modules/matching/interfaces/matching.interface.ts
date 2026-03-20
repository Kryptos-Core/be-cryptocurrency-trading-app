/**
 * Order snapshot for order book (Queue Pattern).
 * Immutable view for matching.
 */
export interface OrderBookOrder {
  order_id: string;
  pair_id: string;
  user_id: string;
  side: 'BUY' | 'SELL';
  type: 'LIMIT' | 'MARKET';
  time_in_force?: 'GTC' | 'IOC' | 'FOK' | string;
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
  trade_id: string;
  pair_id: string;
  maker_order_id: string;
  taker_order_id: string;
  price: string;
  amount: string;
  taker_fee: string;
  maker_fee: string;
  fee_currency_id: string;
  created_at: Date;
}

/**
 * Context passed to matching strategy (Strategy Pattern).
 */
export interface MatchingContext {
  pairId: string;
  takerOrder: OrderBookOrder;
  /** Fee currency (e.g. quote_currency_id) */
  feeCurrencyId: string;
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
      peekBestMaker: (pairId: string, side: 'BUY' | 'SELL') => OrderBookOrder | null;
      popBestMaker: (pairId: string, side: 'BUY' | 'SELL') => OrderBookOrder | null;
      addOrder: (order: OrderBookOrder) => void;
    },
    executeTrade: TradeExecutor,
  ): Promise<TradeExecutionResult[]>;
}

/**
 * Visitor Pattern: operation on TradeExecutionResult without modifying its structure.
 * Each visitor encapsulates one cross-cutting concern (audit, dashboard broadcast, metrics).
 * Register via MatchingService.onTradeExecuted(visitor.visit.bind(visitor)).
 */
export interface ITradeResultVisitor {
  visit(trade: TradeExecutionResult): void | Promise<void>;
}

/**
 * Queue Pattern: order queue contract (price-time priority).
 */
export interface IOrderQueue {
  add(order: OrderBookOrder): void;
  remove(orderId: string): boolean;
  peekBest(): OrderBookOrder | null;
  popBest(): OrderBookOrder | null;
  size(): number;
  getAll(): OrderBookOrder[];
}
