import { Injectable, Logger } from '@nestjs/common';
import type {
  IMatchingStrategy,
  MatchingContext,
  OrderBookOrder,
  TradeExecutionResult,
  TradeExecutor,
} from '../../interfaces';
import { DEFAULT_SCALE, fromBaseUnits, toBaseUnits } from '../../utils';

/**
 * Price-Time Priority Strategy (Strategy Pattern)
 * Limit order matching: match when taker price crosses maker price.
 * BUY taker matches SELL makers with maker.price <= taker.price (best ask first).
 * SELL taker matches BUY makers with maker.price >= taker.price (best bid first).
 *
 * Uses BigInt (int64 base units) for deterministic arithmetic — no floating-point rounding.
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
    const takerPriceBu = takerOrder.price ? toBaseUnits(takerOrder.price, DEFAULT_SCALE) : null;
    let takerRemainingBu = toBaseUnits(takerOrder.remaining, DEFAULT_SCALE);
    const results: TradeExecutionResult[] = [];

    while (takerRemainingBu > 0n) {
      const maker = orderBook.peekBestMaker(pairId, oppositeSide);
      if (!maker) break;

      // Guard: LIMIT makers must have a price. Skip corrupted entries rather than matching at 0.
      if (!maker.price) {
        orderBook.popBestMaker(pairId, oppositeSide);
        this.logger.warn(`Maker ${maker.order_id} has null price for LIMIT type; skipping`);
        continue;
      }

      const makerPriceBu = toBaseUnits(maker.price, DEFAULT_SCALE);
      const makerRemainingBu = toBaseUnits(maker.remaining, DEFAULT_SCALE);
      if (makerRemainingBu <= 0n) {
        orderBook.popBestMaker(pairId, oppositeSide);
        continue;
      }

      // Self-Trade Prevention (STP): evaluated before price check to ensure it is unconditional.
      if (maker.user_id && takerOrder.user_id && maker.user_id === takerOrder.user_id) {
        orderBook.popBestMaker(pairId, oppositeSide);
        this.logger.warn(
          `STP: skipped self-trade maker=${maker.order_id} taker=${takerOrder.order_id} user=${takerOrder.user_id}`,
        );
        continue;
      }

      const priceCrosses =
        takerOrder.side === 'BUY'
          ? takerPriceBu === null || makerPriceBu <= takerPriceBu
          : takerPriceBu === null || makerPriceBu >= takerPriceBu;
      if (!priceCrosses) break;

      const fillAmountBu =
        takerRemainingBu < makerRemainingBu ? takerRemainingBu : makerRemainingBu;
      const fillAmountStr = fromBaseUnits(fillAmountBu, DEFAULT_SCALE);
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

      takerRemainingBu -= fillAmountBu;

      const newMakerRemainingBu = makerRemainingBu - fillAmountBu;
      if (newMakerRemainingBu > 0n) {
        const makerFilledBu = toBaseUnits(maker.filled_amount, DEFAULT_SCALE) + fillAmountBu;
        orderBook.addOrder({
          ...maker,
          filled_amount: fromBaseUnits(makerFilledBu, DEFAULT_SCALE),
          remaining: fromBaseUnits(newMakerRemainingBu, DEFAULT_SCALE),
        });
      }
    }

    return results;
  }
}

