import { ConfigService } from '@nestjs/config';
import bs58 from 'bs58';

/** Read Reown/WalletConnect project id from either accepted env var. */
export function resolveWalletConnectProjectId(configService: ConfigService): string {
  const a = (configService.get<string>('WALLETCONNECT_PROJECT_ID', '') ?? '').trim();
  const b = (configService.get<string>('REOWN_PROJECT_ID', '') ?? '').trim();
  return a || b;
}

/** CAIP-10 `tron:<hexRef>:<base58Address>` (WalletConnect TRON namespace). */
export function parseTronCaip10Account(full: string): { chainId: string; address: string } {
  const prefix = 'tron:';
  if (!full.startsWith(prefix)) {
    throw new Error(`Invalid TRON CAIP-10 account: ${full}`);
  }
  const rest = full.slice(prefix.length);
  const colonIdx = rest.indexOf(':');
  if (colonIdx === -1) {
    throw new Error(`Invalid TRON CAIP-10 account: ${full}`);
  }
  const ref = rest.slice(0, colonIdx);
  const address = rest.slice(colonIdx + 1);
  if (!address) {
    throw new Error(`Invalid TRON CAIP-10 account (empty address): ${full}`);
  }
  return { chainId: `tron:${ref}`, address };
}

/** CAIP-10 `solana:<ref>:<pubkey>`. */
export function parseSolanaCaip10Account(full: string): { chainId: string; pubkey: string } {
  const prefix = 'solana:';
  if (!full.startsWith(prefix)) {
    throw new Error(`Invalid Solana CAIP-10 account: ${full}`);
  }
  const rest = full.slice(prefix.length);
  const colonIdx = rest.indexOf(':');
  if (colonIdx === -1) {
    throw new Error(`Invalid Solana CAIP-10 account: ${full}`);
  }
  const ref = rest.slice(0, colonIdx);
  const pubkey = rest.slice(colonIdx + 1);
  return { chainId: `solana:${ref}`, pubkey };
}

/** Normalize `tron_signMessage` RPC result to hex string for `Trx.verifyMessageV2`. */
export function tronWcSignResultToBackendSignature(raw: unknown): string {
  const sigStr =
    typeof raw === 'string'
      ? raw
      : raw &&
          typeof raw === 'object' &&
          raw !== null &&
          'signature' in raw &&
          typeof (raw as { signature: unknown }).signature === 'string'
        ? (raw as { signature: string }).signature
        : '';
  if (!sigStr) {
    throw new Error('Wallet returned empty TRON signature');
  }
  return sigStr;
}

/** WalletConnect Solana signatures are typically base58; backend verifier expects base64 (64-byte ed25519). */
export function solanaWcResultToBackendSignature(raw: unknown): string {
  const sigStr =
    typeof raw === 'string'
      ? raw
      : raw &&
          typeof raw === 'object' &&
          raw !== null &&
          'signature' in raw &&
          typeof (raw as { signature: unknown }).signature === 'string'
        ? (raw as { signature: string }).signature
        : '';
  if (!sigStr) {
    throw new Error('Wallet returned empty Solana signature');
  }
  try {
    const bytes = bs58.decode(sigStr);
    return Buffer.from(bytes).toString('base64');
  } catch {
    const asB64 = Buffer.from(sigStr, 'base64');
    if (asB64.length === 64) {
      return sigStr;
    }
    throw new Error('Could not decode Solana signature from wallet');
  }
}

export function formatWalletConnectInitError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  let msg = `Không khởi tạo WalletConnect: ${raw}`;
  const lower = raw.toLowerCase();
  if (
    lower.includes('jwt') ||
    lower.includes('not yet valid') ||
    lower.includes('iat') ||
    raw.includes('3000')
  ) {
    msg +=
      ' — Relay từ chối JWT (thường do đồng hồ máy chạy Nest lệch so với thời gian thực: bật đồng bộ thời gian tự động / NTP trên Windows hoặc máy ảo).';
  }
  return msg;
}

export function withWalletConnectTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(label)), ms);
    promise.then(
      (value) => {
        clearTimeout(t);
        resolve(value);
      },
      (error) => {
        clearTimeout(t);
        reject(error);
      },
    );
  });
}
