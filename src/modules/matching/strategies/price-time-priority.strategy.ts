import { Injectable, Logger } from '@nestjs/common';
import Decimal from 'decimal.js';
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
  private readonly logger = new Logger(PriceTimePriorityStrategy.name);

  async match(
    context: MatchingContext,
    orderBook: {
      peekBestMaker: (pairId: string, side: 'BUY' | 'SELL') => OrderBookOrder | null;
      popBestMaker: (pairId: string, side: 'BUY' | 'SELL') => OrderBookOrder | null;
      addOrder: (order: OrderBookOrder) => void;
    },
    executeTrade: TradeExecutor,
  ): Promise<TradeExecutionResult[]> {
    const { pairId, takerOrder } = context;
    const oppositeSide = takerOrder.side === 'BUY' ? 'SELL' : 'BUY';
    const takerPrice = takerOrder.price ? new Decimal(takerOrder.price) : null;
    let takerRemaining = new Decimal(takerOrder.remaining);
    const results: TradeExecutionResult[] = [];

    while (takerRemaining.gt(0)) {
      const maker = orderBook.peekBestMaker(pairId, oppositeSide);
      if (!maker) break;

      // Guard: LIMIT makers must have a price. Skip corrupted entries rather than matching at 0.
      if (!maker.price) {
        orderBook.popBestMaker(pairId, oppositeSide);
        this.logger.warn(`Maker ${maker.order_id} has null price for LIMIT type; skipping`);
        continue;
      }

      const makerPrice = new Decimal(maker.price);
      const makerRemaining = new Decimal(maker.remaining);
      if (makerRemaining.lte(0)) {
        orderBook.popBestMaker(pairId, oppositeSide);
        continue;
      }

      // Self-Trade Prevention (STP): evaluated before price check to ensure it is unconditional.
      // Prevents wash trading, market manipulation, and fee arbitrage.
      if (maker.user_id && takerOrder.user_id && maker.user_id === takerOrder.user_id) {
        orderBook.popBestMaker(pairId, oppositeSide);
        this.logger.warn(
          `STP: skipped self-trade maker=${maker.order_id} taker=${takerOrder.order_id} user=${takerOrder.user_id}`,
        );
        continue;
      }

      const priceCrosses =
        takerOrder.side === 'BUY'
          ? (takerPrice === null || makerPrice.lte(takerPrice))
          : (takerPrice === null || makerPrice.gte(takerPrice));
      if (!priceCrosses) break;

      const fillAmount = Decimal.min(takerRemaining, makerRemaining);
      const fillAmountStr = fillAmount.toFixed();
      const priceStr = maker.price;

      const popped = orderBook.popBestMaker(pairId, oppositeSide);
      if (!popped || popped.order_id !== maker.order_id) continue;

      const tradeResult = await executeTrade(popped, fillAmountStr, priceStr);
      if (!tradeResult) {
        // Execution rejected by DB (e.g. stale in-memory snapshot). Restore maker and stop this run.
        orderBook.addOrder(popped);
        break;
      }

      results.push(tradeResult);

      takerRemaining = takerRemaining.minus(fillAmount);

      const newMakerRemaining = makerRemaining.minus(fillAmount);
      if (newMakerRemaining.gt(0)) {
        orderBook.addOrder({
          ...maker,
          filled_amount: new Decimal(maker.filled_amount).plus(fillAmount).toFixed(),
          remaining: newMakerRemaining.toFixed(),
        });
      }
    }

    return results;
  }
}
