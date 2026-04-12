import { DEFAULT_SCALE, fromBaseUnits, toBaseUnits } from '@/modules/matching/utils';

/**
 * Max quote to freeze for MARKET BUY: amount * bestAsk * (1 + slippage).
 * Uses the same 18-decimal base units as the matching engine / DECIMAL(36,18).
 */
export function computeMarketBuyMaxQuoteReserve(
  bestAsk: string,
  baseAmount: string,
  slippageFraction: string,
): string {
  const scalePow = 10n ** BigInt(DEFAULT_SCALE);
  const amountBu = toBaseUnits(baseAmount.trim(), DEFAULT_SCALE);
  const priceBu = toBaseUnits(bestAsk.trim(), DEFAULT_SCALE);
  const slipBu = toBaseUnits(slippageFraction.trim(), DEFAULT_SCALE);
  const oneBu = toBaseUnits('1', DEFAULT_SCALE);
  const multBu = oneBu + slipBu;
  const maxQuoteBu = (amountBu * priceBu * multBu) / (scalePow * scalePow);
  return fromBaseUnits(maxQuoteBu, DEFAULT_SCALE);
}
