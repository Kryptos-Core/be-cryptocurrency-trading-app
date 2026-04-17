/**
 * Deterministic integer arithmetic for monetary values.
 * Converts between string decimal representation (e.g. "1.500000000000000000")
 * and bigint base units (e.g. 1500000000000000000n) — satoshi-style.
 *
 * Default scale 18 matches the DECIMAL(36,18) column precision.
 */

export const DEFAULT_SCALE = 18;

/**
 * Convert a decimal string to bigint base units.
 * e.g. toBaseUnits("1.5", 18) → 1_500_000_000_000_000_000n
 */
export function toBaseUnits(decimalString: string, scale: number): bigint {
  const trimmed = decimalString.trim();

  const negative = trimmed.startsWith('-');
  const absolute = negative ? trimmed.slice(1) : trimmed;

  const dotIndex = absolute.indexOf('.');
  let intPart: string;
  let fracPart: string;

  if (dotIndex === -1) {
    intPart = absolute;
    fracPart = '';
  } else {
    intPart = absolute.slice(0, dotIndex);
    fracPart = absolute.slice(dotIndex + 1);
  }

  if (fracPart.length > scale) {
    fracPart = fracPart.slice(0, scale);
  } else {
    fracPart = fracPart.padEnd(scale, '0');
  }

  if (intPart === '' || intPart === '0'.repeat(intPart.length)) {
    intPart = '0';
  }

  const combined = intPart + fracPart;
  const value = BigInt(combined);

  return negative ? -value : value;
}

/**
 * Convert bigint base units back to a decimal string.
 * e.g. fromBaseUnits(1_500_000_000_000_000_000n, 18) → "1.500000000000000000"
 */
export function fromBaseUnits(baseUnits: bigint, scale: number): string {
  if (scale === 0) {
    return baseUnits.toString();
  }

  const negative = baseUnits < 0n;
  const absolute = negative ? -baseUnits : baseUnits;
  const str = absolute.toString();

  let intPart: string;
  let fracPart: string;

  if (str.length <= scale) {
    intPart = '0';
    fracPart = str.padStart(scale, '0');
  } else {
    intPart = str.slice(0, str.length - scale);
    fracPart = str.slice(str.length - scale);
  }

  const result = `${intPart}.${fracPart}`;
  return negative ? `-${result}` : result;
}

/**
 * Compare two price strings using BigInt arithmetic.
 * Returns positive if a > b, negative if a < b, 0 if equal.
 * Null prices are treated as `nullValue` (default 0n).
 */
export function comparePriceBigInt(
  a: string | null,
  b: string | null,
  scale: number,
  nullValue: bigint = 0n,
): number {
  const aVal = a !== null ? toBaseUnits(a, scale) : nullValue;
  const bVal = b !== null ? toBaseUnits(b, scale) : nullValue;

  if (aVal > bVal) return 1;
  if (aVal < bVal) return -1;
  return 0;
}
