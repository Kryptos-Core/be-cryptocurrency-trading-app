import { TronWeb } from 'tronweb';

/** Minimal TronWeb instance for hex ↔ base58 conversion only (no RPC calls). */
const tronWebAddress = new TronWeb({ fullHost: 'https://api.trongrid.io' } as any);

/**
 * Normalize a Tron contract address from API (base58, 41-prefixed hex, or 20-byte hex) to base58.
 */
export function normalizeTronContractToBase58(addr: string): string | null {
  const s = addr.trim();
  if (!s) return null;
  if (s.startsWith('T') && s.length >= 26) return s;
  let hex = s.startsWith('0x') || s.startsWith('0X') ? s.slice(2) : s;
  if (!/^[0-9a-fA-F]+$/.test(hex)) return null;
  if (hex.length === 40) hex = `41${hex}`;
  try {
    return tronWebAddress.address.fromHex(hex);
  } catch {
    return null;
  }
}

export function tronContractAddressesEqual(api: string, expectedBase58: string): boolean {
  const a = normalizeTronContractToBase58(api);
  const b = normalizeTronContractToBase58(expectedBase58);
  return a !== null && b !== null && a === b;
}
