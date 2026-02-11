import { Injectable } from '@nestjs/common';
import {
  IMatchingStrategy,
  MatchingContext,
  OrderBookOrder,
  TradeExecutionResult,
  TradeExecutor,
} from '../interfaces';

/**
 * Price-Time Priority Strategy (Strategy Pattern)
 * Limit order matching: match when taker price crosses maker price.
 * BUY taker matches SELL makers with maker.price <= taker.price (best ask first).
 * SELL taker matches BUY makers with maker.price >= taker.price (best bid first).
 */
@Injectable()
export class PriceTimePriorityStrategy implements IMatchingStrategy {
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
    const takerPrice = takerOrder.price ? parseFloat(takerOrder.price) : null;
    let takerRemaining = parseFloat(takerOrder.remaining);
    const results: TradeExecutionResult[] = [];

    while (takerRemaining > 0) {
      const maker = orderBook.peekBestMaker(pairId, oppositeSide);
      if (!maker) break;

      const makerPrice = maker.price ? parseFloat(maker.price) : 0;
      const makerRemaining = parseFloat(maker.remaining);
      if (makerRemaining <= 0) {
        orderBook.popBestMaker(pairId, oppositeSide);
        continue;
      }

      const priceCrosses =
        takerOrder.side === 'BUY'
          ? (takerPrice === null || makerPrice <= takerPrice)
          : (takerPrice === null || makerPrice >= takerPrice);
      if (!priceCrosses) break;

      const fillAmount = Math.min(takerRemaining, makerRemaining);
      const fillAmountStr = String(fillAmount);
      const priceStr = maker.price ?? String(makerPrice);

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
