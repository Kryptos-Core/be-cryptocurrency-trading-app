import {
  buildPaymentConfigFormOptions,
  isPaymentConfigTypeNetworkPairAllowed,
} from './payment-config-form-options.util';

describe('buildPaymentConfigFormOptions', () => {
  it('production: PAYOS + multichain ETH/BSC/TRON/SOL; excludes TON', () => {
    const { types, networksByType } = buildPaymentConfigFormOptions(true);
    expect(types[0]).toBe('PAYOS');
    expect(types).toEqual(expect.arrayContaining(['PAYOS', 'ETH', 'BSC', 'TRON', 'SOL']));
    expect(networksByType.PAYOS).toEqual(['MAINNET']);
    expect(networksByType.ETH).toContain('ETH_MAINNET');
    expect(networksByType.ETH).toContain('BASE_MAINNET');
    expect(networksByType.BSC).toEqual(['BSC_MAINNET']);
    expect(networksByType.SOL).toEqual(['SOLANA_MAINNET']);
    expect(networksByType.TRON).toEqual(['TRON_MAINNET']);
    const allNetworks = Object.values(networksByType).flat() as string[];
    expect(allNetworks.some((n) => n.includes('TON'))).toBe(false);
  });

  it('sandbox: maps BSC to BSC_* and uses TRON_NILE by default', () => {
    const { networksByType } = buildPaymentConfigFormOptions(false, 'TRON_NILE');
    expect(networksByType.BSC).toContain('BSC_CHAPEL');
    expect(networksByType.TRON).toContain('TRON_NILE');
    expect(networksByType.TRON).not.toContain('TRON_SHASTA');
    expect(networksByType.ETH).toContain('ETH_SEPOLIA');
  });

  it('sandbox: respects TRON_SHASTA as default tron row', () => {
    const { networksByType } = buildPaymentConfigFormOptions(false, 'TRON_SHASTA');
    expect(networksByType.TRON).toContain('TRON_SHASTA');
    expect(networksByType.TRON).not.toContain('TRON_NILE');
  });
});

describe('isPaymentConfigTypeNetworkPairAllowed', () => {
  it('allows PAYOS/MAINNET and rejects invalid pairs', () => {
    expect(isPaymentConfigTypeNetworkPairAllowed('PAYOS', 'MAINNET', true)).toBe(true);
    expect(isPaymentConfigTypeNetworkPairAllowed('PAYOS', 'ETH_MAINNET', true)).toBe(false);
    expect(isPaymentConfigTypeNetworkPairAllowed('ETH', 'TRON_MAINNET', true)).toBe(false);
  });

  it('allows ETH/BASE_MAINNET in production', () => {
    expect(isPaymentConfigTypeNetworkPairAllowed('ETH', 'BASE_MAINNET', true)).toBe(true);
  });
});
