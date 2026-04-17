/**
 * Anti-corruption port: orders bounded context triggers matching side-effects
 * without importing `modules/matching/application/**` (module boundary rule).
 */
export const ORDER_MATCHING_GATEWAY = Symbol('ORDER_MATCHING_GATEWAY');

/** Minimal order snapshot for enqueue — must stay in sync with matching queue contract */
export interface OrderBookOrderSnapshot {
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
  remaining: string;
  slippage_tolerance?: string | null;
}

export interface MatchingReconcileResultSnapshot {
  pairId: string;
  tradesExecuted: number;
  matchRuns: number;
  openOrdersRemaining: number;
  stoppedReason: 'all_matched' | 'no_progress' | 'max_rounds';
}

export interface OrderMatchingGatewayPort {
  enqueueMatch(input: {
    takerOrder: OrderBookOrderSnapshot;
    pairId: string;
    feeCurrencyId: string;
    makerFeeRate: string;
    takerFeeRate: string;
    slippageTolerance?: string;
  }): Promise<void>;

  removeOrderFromBook(pairId: string, orderId: string, side: 'BUY' | 'SELL'): Promise<boolean>;

  reconcileOpenOrdersForPair(input: {
    pairId: string;
    feeCurrencyId: string;
    makerFeeRate: string;
    takerFeeRate: string;
  }): Promise<MatchingReconcileResultSnapshot>;
}
