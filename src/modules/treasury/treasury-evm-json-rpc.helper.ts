import { JsonRpcProvider } from 'ethers';
import { SystemConfigService } from '@/modules/system-config/system-config.service';

/** JsonRpcProvider for any EVM treasury chain code (uses system_configs / env per `evm-chain-definitions`). */
export async function jsonRpcProviderForTreasuryEvmChain(
  chain: string,
  systemConfig: SystemConfigService,
): Promise<JsonRpcProvider> {
  const url = await systemConfig.resolveEvmRpcUrlForTreasuryChain(chain);
  return new JsonRpcProvider(url);
}
