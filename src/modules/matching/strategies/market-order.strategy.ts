import { Injectable } from '@nestjs/common';
import {
  IMatchingStrategy,
  MatchingContext,
  OrderBookOrder,
  TradeExecutionResult,
  TradeExecutor,
} from '../interfaces';

/**
 * Market Order Strategy (Strategy Pattern)
 * Takes best available price(s) until filled or book empty.
 * Same as price-time but taker has no price limit (treat as always crossing).
 */
@Injectable()
export class MarketOrderStrategy implements IMatchingStrategy {
  async match(
    context: MatchingContext,
    orderBook: {
      peekBestMaker: (pairId: number, side: 'BUY' | 'SELL') => OrderBookOrder | null;
      popBestMaker: (pairId: number, side: 'BUY' | 'SELL') => OrderBookOrder | null;
      addOrder: (order: OrderBookOrder) => void;
    },
    executeTrade: TradeExecutor,
  ): Promise<TradeExecutionResult[]> {
    const { pairId, takerOrder } = context;
    const oppositeSide = takerOrder.side === 'BUY' ? 'SELL' : 'BUY';
    let takerRemaining = parseFloat(takerOrder.remaining);
    const results: TradeExecutionResult[] = [];

    while (takerRemaining > 0) {
      const maker = orderBook.peekBestMaker(pairId, oppositeSide);
      if (!maker) break;

      const makerRemaining = parseFloat(maker.remaining);
      if (makerRemaining <= 0) {
        orderBook.popBestMaker(pairId, oppositeSide);
        continue;
      }

      const fillAmount = Math.min(takerRemaining, makerRemaining);
      const fillAmountStr = String(fillAmount);
      const priceStr = maker.price ?? '0';

      const popped = orderBook.popBestMaker(pairId, oppositeSide);
      if (!popped || popped.order_id !== maker.order_id) continue;

      const tradeResult = await executeTrade(popped, fillAmountStr, priceStr);
      if (tradeResult) results.push(tradeResult);

      takerRemaining -= fillAmount;

      const newMakerRemaining = makerRemaining - fillAmount;
      if (newMakerRemaining > 0) {
        orderBook.addOrder({
          ...maker,
          filled_amount: String(parseFloat(maker.filled_amount) + fillAmount),
          remaining: String(newMakerRemaining),
        });
      }
    }

    return results;
  }
}
