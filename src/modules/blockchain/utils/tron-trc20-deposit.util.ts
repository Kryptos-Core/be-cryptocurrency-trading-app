import type { TronWebAddressSun } from './tron-native-transfer.util';

const TRC20_TRANSFER_SELECTOR = 'a9059cbb';

function normalizeHexData(data: unknown): string | null {
  if (typeof data !== 'string' || !data.length) return null;
  const s = data.startsWith('0x') || data.startsWith('0X') ? data.slice(2) : data;
  return /^[0-9a-fA-F]+$/.test(s) ? s.toLowerCase() : null;
}

/** 20-byte EVM-style address in 32-byte word → Tron base58 (41-prefixed hex). */
function tronBase58FromWord(tronWeb: TronWebAddressSun, word32Hex: string): string | null {
  if (word32Hex.length < 64) return null;
  const addr20 = word32Hex.slice(24, 64);
  if (addr20.length !== 40) return null;
  const tron21 = `41${addr20}`;
  try {
    return tronWeb.address.fromHex(tron21);
  } catch {
    return null;
  }
}

export type TronTrc20TransferLeg = {
  from: string;
  to: string;
  amountHuman: string;
};

/**
 * Decode TRC-20 `transfer(address,uint256)` calls in a Tron tx toward [expectedRecipient] for [usdtContractBase58].
 */
export function extractTronUsdtTrc20TransfersToRecipient(
  tronWeb: TronWebAddressSun,
  tx: { raw_data?: { contract?: unknown[] } } | null | undefined,
  usdtContractBase58: string,
  expectedRecipientBase58: string,
  decimals: number,
): TronTrc20TransferLeg[] {
  const out: TronTrc20TransferLeg[] = [];
  const contracts = tx?.raw_data?.contract;
  if (!Array.isArray(contracts)) return out;

  const expected = expectedRecipientBase58.trim();
  const usdt = usdtContractBase58.trim();

  for (const c of contracts) {
    if (!c || typeof c !== 'object') continue;
    const node = c as {
      type?: unknown;
      parameter?: { value?: Record<string, unknown> };
    };
    const t = node.type;
    const isTrigger =
      t === 'TriggerSmartContract' ||
      t === 31 ||
      t === '31' ||
      (typeof t === 'string' && String(t).toLowerCase() === 'triggersmartcontract');
    if (!isTrigger) continue;

    const value = node.parameter?.value;
    if (!value || typeof value !== 'object') continue;

    const contractField = value.contract_address;
    let contractBase58: string;
    if (typeof contractField === 'string' && contractField.length) {
      if (contractField.startsWith('T') && contractField.length >= 30) {
        contractBase58 = contractField;
      } else {
        const h = contractField.startsWith('0x') ? contractField.slice(2) : contractField;
        try {
          contractBase58 = tronWeb.address.fromHex(h.length === 40 ? `41${h}` : h);
        } catch {
          continue;
        }
      }
    } else {
      continue;
    }

    if (contractBase58 !== usdt) continue;

    const ownerHex = value.owner_address;
    let from: string;
    if (typeof ownerHex === 'string' && ownerHex.length) {
      const h = ownerHex.startsWith('0x') ? ownerHex.slice(2) : ownerHex;
      try {
        from = tronWeb.address.fromHex(h.length === 40 ? `41${h}` : h);
      } catch {
        continue;
      }
    } else {
      continue;
    }

    const dataHex = normalizeHexData(value.data);
    if (!dataHex || dataHex.length < 8 + 128) continue;
    if (dataHex.slice(0, 8) !== TRC20_TRANSFER_SELECTOR) continue;

    const toBase58 = tronBase58FromWord(tronWeb, dataHex.slice(8, 8 + 64));
    const amountWord = dataHex.slice(8 + 64, 8 + 128);
    if (!toBase58 || amountWord.length < 64) continue;
    if (toBase58 !== expected) continue;

    let amountRaw: bigint;
    try {
      amountRaw = BigInt(`0x${amountWord}`);
    } catch {
      continue;
    }

    const div = 10n ** BigInt(decimals);
    const whole = amountRaw / div;
    const frac = amountRaw % div;
    let amountHuman = whole.toString();
    if (decimals > 0 && frac > 0n) {
      const fracStr = frac.toString().padStart(decimals, '0').replace(/0+$/, '');
      if (fracStr.length) amountHuman = `${whole}.${fracStr}`;
    }

    out.push({ from, to: toBase58, amountHuman });
  }

  return out;
}
