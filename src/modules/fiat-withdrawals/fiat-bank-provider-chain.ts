import type { FiatBankProviderConfig } from './fiat-bank-provider.types';

export type FiatBankProviderEnvSlice = {
  chainJson?: string;
  banksUrl?: string;
  lookupUrl?: string;
  healthUrl?: string;
  clientId?: string;
  apiKey?: string;
};

/**
 * Thứ tự trong mảng = độ ưu tiên (A lỗi → B).
 * Nếu không có JSON: dùng một provider từ FIAT_BANK_PROVIDER_* legacy.
 */
export function buildFiatBankProviderChain(env: FiatBankProviderEnvSlice): FiatBankProviderConfig[] {
  const json = env.chainJson?.trim();
  if (json) {
    try {
      const arr = JSON.parse(json) as unknown;
      if (!Array.isArray(arr)) return [];
      return arr
        .map((x: Record<string, unknown>, i: number) => ({
          id: String(x.id ?? `provider_${i + 1}`),
          banksUrl: String(x.banksUrl ?? '').trim(),
          lookupUrl: String(x.lookupUrl ?? '').trim(),
          healthUrl: x.healthUrl ? String(x.healthUrl).trim() : undefined,
          clientId: x.clientId ? String(x.clientId).trim() : undefined,
          apiKey: x.apiKey ? String(x.apiKey).trim() : undefined,
        }))
        .filter((p) => p.banksUrl.length > 0 && p.lookupUrl.length > 0);
    } catch {
      return [];
    }
  }

  const banksUrl = env.banksUrl?.trim();
  const lookupUrl = env.lookupUrl?.trim();
  if (banksUrl && lookupUrl) {
    return [
      {
        id: 'default',
        banksUrl,
        lookupUrl,
        healthUrl: env.healthUrl?.trim() || undefined,
        clientId: env.clientId?.trim() || undefined,
        apiKey: env.apiKey?.trim() || undefined,
      },
    ];
  }

  return [];
}
