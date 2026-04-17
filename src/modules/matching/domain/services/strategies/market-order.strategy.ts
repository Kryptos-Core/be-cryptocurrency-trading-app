import { Injectable, Logger } from '@nestjs/common';
import type {
  IMatchingStrategy,
  MatchingContext,
  OrderBookOrder,
  TradeExecutionResult,
  TradeExecutor,
} from '../../interfaces';
import { DEFAULT_SCALE, fromBaseUnits, toBaseUnits } from '../../utils';

const SCALE_MULTIPLIER = 10n ** BigInt(DEFAULT_SCALE);

/**
 * Market Order Strategy (Strategy Pattern)
 * Takes best available price(s) until filled or book empty.
 * Same as price-time but taker has no price limit (treat as always crossing).
 *
 * Uses BigInt (int64 base units) for deterministic arithmetic — no floating-point rounding.
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
    let takerRemainingBu = toBaseUnits(takerOrder.remaining, DEFAULT_SCALE);
    const results: TradeExecutionResult[] = [];

    const toleranceBu =
      slippageTolerance && toBaseUnits(slippageTolerance, DEFAULT_SCALE) > 0n
        ? toBaseUnits(slippageTolerance, DEFAULT_SCALE)
        : null;
    /** Reference price is anchored to the first fill to compute the protection threshold. */
    let referencePriceBu: bigint | null = null;

    while (takerRemainingBu > 0n) {
      const maker = orderBook.peekBestMaker(pairId, oppositeSide);
      if (!maker) break;

      const makerRemainingBu = toBaseUnits(maker.remaining, DEFAULT_SCALE);
      if (makerRemainingBu <= 0n) {
        orderBook.popBestMaker(pairId, oppositeSide);
        continue;
      }

      // Self-Trade Prevention (STP): evaluated unconditionally before any fill.
      if (maker.user_id && takerOrder.user_id && maker.user_id === takerOrder.user_id) {
        orderBook.popBestMaker(pairId, oppositeSide);
        this.logger.warn(
          `STP: skipped self-trade maker=${maker.order_id} taker=${takerOrder.order_id} user=${takerOrder.user_id}`,
        );
        continue;
      }

      const makerPriceBu = toBaseUnits(maker.price ?? '0', DEFAULT_SCALE);

      // Price protection: reject fill if slippage exceeds tolerance.
      if (toleranceBu !== null && maker.price != null) {
        const ref = referencePriceBu ?? makerPriceBu;
        // BUY: threshold = ref * (1 + tolerance) = ref * (SCALE + toleranceBu) / SCALE
        // SELL: threshold = ref * (1 - tolerance) = ref * (SCALE - toleranceBu) / SCALE
        const exceeded =
          takerOrder.side === 'BUY'
            ? makerPriceBu * SCALE_MULTIPLIER > ref * (SCALE_MULTIPLIER + toleranceBu)
            : makerPriceBu * SCALE_MULTIPLIER < ref * (SCALE_MULTIPLIER - toleranceBu);

        if (exceeded) {
          const popped = orderBook.popBestMaker(pairId, oppositeSide);
          if (popped) {
            orderBook.addOrder(popped);
          }
          this.logger.warn(
            `Price protection: market order ${takerOrder.order_id} stopped at maker ${maker.order_id} price=${maker.price} ref=${fromBaseUnits(ref, DEFAULT_SCALE)} tolerance=${slippageTolerance}`,
          );
          break;
        }
      }

      const fillAmountBu =
        takerRemainingBu < makerRemainingBu ? takerRemainingBu : makerRemainingBu;
      const fillAmountStr = fromBaseUnits(fillAmountBu, DEFAULT_SCALE);
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
      if (referencePriceBu === null) {
        referencePriceBu = makerPriceBu;
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

