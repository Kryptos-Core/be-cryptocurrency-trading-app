/**
 * Parse native TRX (TransferContract) fields from a Tron getTransaction payload.
 * TRC-20 and other contract types are ignored (returns null).
 */

export type TronWebAddressSun = {
  address: { fromHex: (hex: string) => string };
  fromSun: (sun: number | string | bigint) => string;
};

/** Protobuf / fullnode JSON uses enum int or string name depending on client. */
function isTronTransferContractType(type: unknown): boolean {
  if (type === 'TransferContract') return true;
  if (type === 1 || type === '1') return true;
  return false;
}

function hexFromTronField(addr: unknown): string | null {
  if (typeof addr === 'string' && addr.length) {
    const h = addr.startsWith('0x') || addr.startsWith('0X') ? addr.slice(2) : addr;
    return /^[0-9a-fA-F]+$/.test(h) ? h : null;
  }
  if (addr instanceof Uint8Array) {
    const h = Buffer.from(addr).toString('hex');
    return h.length ? h : null;
  }
  return null;
}

/**
 * @returns from/to base58 and value as decimal TRX string, or null if no TransferContract.
 */
export function extractTronNativeTransferMeta(
  tronWeb: TronWebAddressSun,
  tx: { raw_data?: { contract?: unknown[] } } | null | undefined,
): { from: string; to: string; value: string } | null {
  const contracts = tx?.raw_data?.contract;
  if (!Array.isArray(contracts)) return null;

  for (const c of contracts) {
    if (!c || typeof c !== 'object') continue;
    const node = c as { type?: unknown; parameter?: { value?: Record<string, unknown> } };
    if (!isTronTransferContractType(node.type)) continue;

    const value = node.parameter?.value;
    if (!value || typeof value !== 'object') continue;

    const ownerHex = hexFromTronField(value.owner_address);
    const toHex = hexFromTronField(value.to_address);
    const rawAmount = value.amount;
    if (ownerHex == null || toHex == null || rawAmount === undefined || rawAmount === null) {
      continue;
    }

    let sun: bigint;
    try {
      sun = BigInt(String(rawAmount));
    } catch {
      continue;
    }

    const from = tronWeb.address.fromHex(ownerHex);
    const to = tronWeb.address.fromHex(toHex);
    const valueTrx = tronWeb.fromSun(sun);

    return { from, to, value: String(valueTrx) };
  }

  return null;
}

/** First contract owner_address as base58 (legacy behaviour for non-transfer txs). */
export function extractTronFirstContractOwnerBase58(
  tronWeb: TronWebAddressSun,
  tx: { raw_data?: { contract?: unknown[] } } | null | undefined,
): string {
  const c0 = tx?.raw_data?.contract?.[0] as
    | { parameter?: { value?: Record<string, unknown> } }
    | undefined;
  const owner = c0?.parameter?.value?.owner_address;
  const hex = hexFromTronField(owner);
  if (!hex) return '';
  try {
    return tronWeb.address.fromHex(hex);
  } catch {
    return '';
  }
}
