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
    const { pairId, takerOrder, slippageTolerance } = context;
    const oppositeSide = takerOrder.side === 'BUY' ? 'SELL' : 'BUY';
    let takerRemaining = new Decimal(takerOrder.remaining);
    const results: TradeExecutionResult[] = [];

    const tolerance =
      slippageTolerance && new Decimal(slippageTolerance).gt(0)
        ? new Decimal(slippageTolerance)
        : null;
    /** Reference price is anchored to the first fill to compute the protection threshold. */
    let referencePrice: Decimal | null = null;

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

      const makerPrice = new Decimal(maker.price ?? '0');

      // Price protection: reject fill if slippage exceeds tolerance.
      if (tolerance !== null && maker.price != null) {
        const ref = referencePrice ?? makerPrice;
        const exceeded =
          takerOrder.side === 'BUY'
            ? makerPrice.gt(ref.mul(new Decimal(1).plus(tolerance)))
            : makerPrice.lt(ref.mul(new Decimal(1).minus(tolerance)));

        if (exceeded) {
          const popped = orderBook.popBestMaker(pairId, oppositeSide);
          if (popped) {
            orderBook.addOrder(popped);
          }
          this.logger.warn(
            `Price protection: market order ${takerOrder.order_id} stopped at maker ${maker.order_id} price=${maker.price} ref=${ref.toFixed()} tolerance=${tolerance.toFixed()}`,
          );
          break;
        }
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

      // Anchor reference price on first fill.
      if (referencePrice === null) {
        referencePrice = makerPrice;
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
