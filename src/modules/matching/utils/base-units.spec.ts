import { toBaseUnits, fromBaseUnits, comparePriceBigInt } from './base-units';

const SCALE_18 = 18;

describe('toBaseUnits', () => {
  it('converts "1.0" with scale 18 to 1e18 base units', () => {
    expect(toBaseUnits('1.0', SCALE_18)).toBe(1_000_000_000_000_000_000n);
  });

  it('converts smallest representable unit', () => {
    expect(toBaseUnits('0.000000000000000001', SCALE_18)).toBe(1n);
  });

  it('converts large number with full decimals', () => {
    expect(toBaseUnits('123456789.123456789012345678', SCALE_18)).toBe(
      123456789_123456789012345678n,
    );
  });

  it('converts zero', () => {
    expect(toBaseUnits('0', SCALE_18)).toBe(0n);
  });

  it('converts integer without decimal point', () => {
    expect(toBaseUnits('42', SCALE_18)).toBe(42_000_000_000_000_000_000n);
  });

  it('converts with scale 0', () => {
    expect(toBaseUnits('100', 0)).toBe(100n);
  });

  it('handles negative values', () => {
    expect(toBaseUnits('-1.5', SCALE_18)).toBe(-1_500_000_000_000_000_000n);
  });

  it('truncates excess decimals beyond scale', () => {
    // 19 decimal digits → truncate to 18
    expect(toBaseUnits('1.1234567890123456789', SCALE_18)).toBe(
      1_123456789012345678n,
    );
  });

  it('trims leading/trailing whitespace', () => {
    expect(toBaseUnits(' 1.5 ', SCALE_18)).toBe(1_500_000_000_000_000_000n);
  });

  it('pads short fractional part', () => {
    expect(toBaseUnits('1.5', SCALE_18)).toBe(1_500_000_000_000_000_000n);
  });

  it('handles "0.0"', () => {
    expect(toBaseUnits('0.0', SCALE_18)).toBe(0n);
  });
});

describe('fromBaseUnits', () => {
  it('converts 1e18 base units to "1.000000000000000000"', () => {
    expect(fromBaseUnits(1_000_000_000_000_000_000n, SCALE_18)).toBe(
      '1.000000000000000000',
    );
  });

  it('converts 1 base unit to smallest decimal', () => {
    expect(fromBaseUnits(1n, SCALE_18)).toBe('0.000000000000000001');
  });

  it('converts 0 base units', () => {
    expect(fromBaseUnits(0n, SCALE_18)).toBe('0.000000000000000000');
  });

  it('converts large value back to string', () => {
    expect(fromBaseUnits(123456789_123456789012345678n, SCALE_18)).toBe(
      '123456789.123456789012345678',
    );
  });

  it('converts with scale 0', () => {
    expect(fromBaseUnits(100n, 0)).toBe('100');
  });

  it('converts negative base units', () => {
    expect(fromBaseUnits(-1_500_000_000_000_000_000n, SCALE_18)).toBe(
      '-1.500000000000000000',
    );
  });
});

describe('round-trip consistency', () => {
  const values = [
    '0.000000000000000000',
    '1.000000000000000000',
    '0.100000000000000000',
    '99999999.999999999999999999',
    '0.000000000000000001',
    '50000.123456789012345678',
  ];

  it.each(values)('round-trips %s through toBaseUnits → fromBaseUnits', (v) => {
    expect(fromBaseUnits(toBaseUnits(v, SCALE_18), SCALE_18)).toBe(v);
  });
});

describe('comparePriceBigInt', () => {
  it('returns positive when a > b', () => {
    expect(comparePriceBigInt('100.50', '100.49', SCALE_18)).toBeGreaterThan(0);
  });

  it('returns 0 when a === b', () => {
    expect(comparePriceBigInt('100.50', '100.50', SCALE_18)).toBe(0);
  });

  it('returns negative when a < b', () => {
    expect(
      comparePriceBigInt(
        '0.000000000000000001',
        '0.000000000000000002',
        SCALE_18,
      ),
    ).toBeLessThan(0);
  });

  it('treats null as 0 by default', () => {
    expect(comparePriceBigInt(null, '100', SCALE_18)).toBeLessThan(0);
    expect(comparePriceBigInt('100', null, SCALE_18)).toBeGreaterThan(0);
    expect(comparePriceBigInt(null, null, SCALE_18)).toBe(0);
  });

  it('distinguishes values where parseFloat fails (> 2^53)', () => {
    // parseFloat('9007199254740992.5') === parseFloat('9007199254740992.6')
    // BigInt must distinguish them
    expect(
      comparePriceBigInt(
        '9007199254740992.5',
        '9007199254740992.6',
        SCALE_18,
      ),
    ).toBeLessThan(0);
  });
});
