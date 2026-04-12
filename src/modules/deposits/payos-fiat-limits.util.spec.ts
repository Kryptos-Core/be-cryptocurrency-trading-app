import type { PayosGatewayConfig } from '@/modules/payment-config/interfaces/payment-gateway-config.interface';
import {
  PAYOS_DEFAULT_MIN_FIAT_DEPOSIT,
  resolvePayosFiatDepositLimits,
} from './payos-fiat-limits.util';

function baseConfig(over: Partial<PayosGatewayConfig> = {}): PayosGatewayConfig {
  return {
    clientId: 'a',
    apiKey: 'b',
    checksumKey: 'c',
    returnUrl: 'r',
    cancelUrl: 'x',
    fiatSymbol: 'VND',
    quoteCurrencySymbol: 'USDT',
    fiatToQuoteRate: '1',
    fxSpreadBps: '0',
    ...over,
  };
}

describe('resolvePayosFiatDepositLimits', () => {
  it('uses default min when unset', () => {
    const r = resolvePayosFiatDepositLimits(baseConfig(), {});
    expect(r.minAmount).toBe(PAYOS_DEFAULT_MIN_FIAT_DEPOSIT);
    expect(r.maxAmount).toBeUndefined();
  });

  it('reads min from config', () => {
    const r = resolvePayosFiatDepositLimits(baseConfig({ minDepositAmountFiat: '5000' }), {});
    expect(r.minAmount).toBe(5000);
  });

  it('falls back env min when config empty', () => {
    const r = resolvePayosFiatDepositLimits(baseConfig(), { min: '3000' });
    expect(r.minAmount).toBe(3000);
  });

  it('config min wins over env', () => {
    const r = resolvePayosFiatDepositLimits(baseConfig({ minDepositAmountFiat: '7000' }), {
      min: '3000',
    });
    expect(r.minAmount).toBe(7000);
  });

  it('parses max and drops max < min', () => {
    const r = resolvePayosFiatDepositLimits(
      baseConfig({ minDepositAmountFiat: '10000', maxDepositAmountFiat: '5000' }),
      {},
    );
    expect(r.minAmount).toBe(10000);
    expect(r.maxAmount).toBeUndefined();
  });

  it('returns max when >= min', () => {
    const r = resolvePayosFiatDepositLimits(
      baseConfig({ minDepositAmountFiat: '1000', maxDepositAmountFiat: '5000000' }),
      {},
    );
    expect(r.minAmount).toBe(1000);
    expect(r.maxAmount).toBe(5000000);
  });
});
