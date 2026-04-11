import { PayosGatewayConfig } from '@/modules/payment-config/interfaces/payment-gateway-config.interface';

export const PAYOS_DEFAULT_MIN_FIAT_DEPOSIT = 10000;

/**
 * Resolves min/max fiat deposit amounts for PayOS from config (DB) with optional .env fallback.
 */
export function resolvePayosFiatDepositLimits(
  config: PayosGatewayConfig,
  envFallback?: { min?: string; max?: string },
): { minAmount: number; maxAmount?: number } {
  const rawMin =
    (config.minDepositAmountFiat != null && String(config.minDepositAmountFiat).trim() !== ''
      ? String(config.minDepositAmountFiat).trim()
      : undefined) ?? envFallback?.min?.trim();

  let minAmount = PAYOS_DEFAULT_MIN_FIAT_DEPOSIT;
  if (rawMin != null && rawMin !== '') {
    const n = Math.floor(Number(rawMin));
    if (Number.isFinite(n) && n >= 1) {
      minAmount = n;
    }
  }

  const rawMax =
    (config.maxDepositAmountFiat != null && String(config.maxDepositAmountFiat).trim() !== ''
      ? String(config.maxDepositAmountFiat).trim()
      : undefined) ?? envFallback?.max?.trim();

  let maxAmount: number | undefined;
  if (rawMax != null && rawMax !== '') {
    const n = Math.floor(Number(rawMax));
    if (Number.isFinite(n) && n >= 1) {
      maxAmount = n;
    }
  }

  if (maxAmount != null && maxAmount < minAmount) {
    maxAmount = undefined;
  }

  return { minAmount, maxAmount };
}
