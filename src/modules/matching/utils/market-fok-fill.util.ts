import { DEFAULT_SCALE, toBaseUnits } from '@/common/utils/base-units';
import type { OrderBookOrder } from '../interfaces';

const SCALE_MULTIPLIER = 10n ** BigInt(DEFAULT_SCALE);

/**
 * Whether a MARKET taker can fully consume `remaining` base from makers in order,
 * respecting the same slippage rule as MarketOrderStrategy (reference = first fill price).
 *
 * Keep threshold math aligned with `MarketOrderStrategy` when changing either file.
 */
export function marketOrderCanFullyFillRemaining(
  makers: OrderBookOrder[],
  takerOrder: OrderBookOrder,
  slippageTolerance?: string,
): boolean {
  const oppositeSide = takerOrder.side === 'BUY' ? 'SELL' : 'BUY';
  if (oppositeSide !== 'SELL' && oppositeSide !== 'BUY') return false;

  let remainingBu = toBaseUnits(takerOrder.remaining, DEFAULT_SCALE);
  const toleranceBu =
    slippageTolerance && toBaseUnits(slippageTolerance, DEFAULT_SCALE) > 0n
      ? toBaseUnits(slippageTolerance, DEFAULT_SCALE)
      : null;
  let referencePriceBu: bigint | null = null;

  for (const maker of makers) {
    if (remainingBu <= 0n) break;

    const makerRemainingBu = toBaseUnits(maker.remaining, DEFAULT_SCALE);
    if (makerRemainingBu <= 0n) continue;

    if (maker.user_id && takerOrder.user_id && maker.user_id === takerOrder.user_id) {
      continue;
    }

    const makerPriceBu = toBaseUnits(maker.price ?? '0', DEFAULT_SCALE);

    if (toleranceBu !== null && maker.price != null) {
      const ref = referencePriceBu ?? makerPriceBu;
      const exceeded =
        takerOrder.side === 'BUY'
          ? makerPriceBu * SCALE_MULTIPLIER > ref * (SCALE_MULTIPLIER + toleranceBu)
          : makerPriceBu * SCALE_MULTIPLIER < ref * (SCALE_MULTIPLIER - toleranceBu);
      if (exceeded) {
        break;
      }
    }

    const fillBu = remainingBu < makerRemainingBu ? remainingBu : makerRemainingBu;
    if (referencePriceBu === null) {
      referencePriceBu = makerPriceBu;
    }
    remainingBu -= fillBu;
  }

  return remainingBu <= 0n;
}
