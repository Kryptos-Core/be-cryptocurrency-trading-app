import type { ITradeResultVisitor, TradeExecutionResult } from '../../interfaces';
import type { EventStore, TradeExecutedEvent } from '../projections/event-store';

export class EventStoreVisitor implements ITradeResultVisitor {
  constructor(private readonly store: EventStore) {}

  visit(trade: TradeExecutionResult): void {
    const event: TradeExecutedEvent = {
      type: 'TradeExecuted',
      timestamp: trade.created_at,
      pairId: trade.pair_id,
      tradeId: trade.trade_id,
      makerOrderId: trade.maker_order_id,
      takerOrderId: trade.taker_order_id,
      price: trade.price,
      amount: trade.amount,
      makerFee: trade.maker_fee,
      takerFee: trade.taker_fee,
    };
    this.store.append(event);
  }
}
