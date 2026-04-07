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
 * Market Order Strategy (Strategy Pattern)
 * Takes best available price(s) until filled or book empty.
 * Same as price-time but taker has no price limit (treat as always crossing).
 */
@Injectable()
export class MarketOrderStrategy implements IMatchingStrategy {
  private readonly logger = new Logger(MarketOrderStrategy.name);

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
    let takerRemaining = new Decimal(takerOrder.remaining);
    const results: TradeExecutionResult[] = [];

    while (takerRemaining.gt(0)) {
      const maker = orderBook.peekBestMaker(pairId, oppositeSide);
      if (!maker) break;

      const makerRemaining = new Decimal(maker.remaining);
      if (makerRemaining.lte(0)) {
        orderBook.popBestMaker(pairId, oppositeSide);
        continue;
      }

      // Self-Trade Prevention (STP): evaluated unconditionally before any fill.
      // Prevents wash trading, market manipulation, and fee arbitrage.
      if (maker.user_id && takerOrder.user_id && maker.user_id === takerOrder.user_id) {
        orderBook.popBestMaker(pairId, oppositeSide);
        this.logger.warn(
          `STP: skipped self-trade maker=${maker.order_id} taker=${takerOrder.order_id} user=${takerOrder.user_id}`,
        );
        continue;
      }

      const fillAmount = Decimal.min(takerRemaining, makerRemaining);
      const fillAmountStr = fillAmount.toFixed();
      const priceStr = maker.price ?? '0';

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
