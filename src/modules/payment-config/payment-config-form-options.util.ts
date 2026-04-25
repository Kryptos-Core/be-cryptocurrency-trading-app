import type { ChainNetworkCatalogItemDto } from '@/common/constants/chain-registry';
import { buildNetworkCatalog } from '@/common/constants/chain-registry';
import type { PaymentMethodType } from '@/entities/payment-method-config.entity';
import { resolveTreasuryChainsUseMainnetOnly } from '@/modules/treasury/onchain-chain-picker.util';

const TYPE_ORDER: PaymentMethodType[] = ['PAYOS', 'ETH', 'BSC', 'TRON', 'SOL'];

/**
 * Map chain-registry catalog row → coarse payment_method_configs.type.
 * TON is omitted until DB enum + gateway shape support it.
 */
export function paymentMethodTypeForCatalogRow(
  row: ChainNetworkCatalogItemDto,
): Exclude<PaymentMethodType, 'PAYOS'> | null {
  if (row.family === 'ton') return null;
  const code = row.code;
  if (code.startsWith('BSC_')) return 'BSC';
  if (code.startsWith('SOLANA_')) return 'SOL';
  if (code.startsWith('TRON_')) return 'TRON';
  if (row.family === 'evm') return 'ETH';
  if (row.family === 'solana') return 'SOL';
  if (row.family === 'tron') return 'TRON';
  return null;
}

/**
 * Admin payment-config form metadata — same chain universe as treasury chain-picker
 * (see buildNetworkCatalog), grouped by encrypted_config family.
 */
export function buildPaymentConfigFormOptions(
  mainnetOnly: boolean,
  tronDefaultNetwork?: string,
): { types: string[]; networksByType: Record<string, string[]> } {
  const accum: Record<Exclude<PaymentMethodType, 'PAYOS'>, string[]> = {
    ETH: [],
    BSC: [],
    TRON: [],
    SOL: [],
  };

  const catalog = buildNetworkCatalog(mainnetOnly, tronDefaultNetwork);
  for (const row of catalog) {
    const pmType = paymentMethodTypeForCatalogRow(row);
    if (pmType === null) continue;
    accum[pmType].push(row.code);
  }

  const tronNetworks = mainnetOnly
    ? accum.TRON
    : accum.TRON.filter((code) => {
        const preferred = (tronDefaultNetwork ?? 'TRON_NILE').trim().toUpperCase();
        return code === preferred;
      });

  const networksByType: Record<string, string[]> = {
    PAYOS: ['MAINNET'],
    ETH: accum.ETH,
    BSC: accum.BSC,
    TRON: tronNetworks,
    SOL: accum.SOL,
  };

  const types = TYPE_ORDER.filter((t) => (networksByType[t] ?? []).length > 0);
  const trimmed: Record<string, string[]> = {};
  for (const t of types) {
    const nets = networksByType[t];
    if (nets) {
      trimmed[t] = nets;
    }
  }

  return { types, networksByType: trimmed };
}

export function isPaymentConfigTypeNetworkPairAllowed(
  type: string,
  network: string,
  mainnetOnly: boolean,
  tronDefaultNetwork?: string,
): boolean {
  const opts = buildPaymentConfigFormOptions(mainnetOnly, tronDefaultNetwork);
  const list = opts.networksByType[type];
  return Array.isArray(list) && list.includes(network);
}

/** Same env resolution as treasury chain-picker (ONCHAIN_OPERATOR_MODE, ENV, TRON_DEFAULT_NETWORK). */
export function resolvePaymentConfigFormOptionsEnv(config: {
  get: (key: string) => string | undefined;
}): { mainnetOnly: boolean; tronDefaultNetwork?: string } {
  return {
    mainnetOnly: resolveTreasuryChainsUseMainnetOnly({
      onchainOperatorMode: config.get('ONCHAIN_OPERATOR_MODE'),
      env: config.get('ENV') ?? config.get('NODE_ENV'),
    }),
    tronDefaultNetwork: config.get('TRON_DEFAULT_NETWORK'),
  };
}
