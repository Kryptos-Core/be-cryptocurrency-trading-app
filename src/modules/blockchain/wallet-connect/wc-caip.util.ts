import { BadRequestException } from '@/common/exceptions';
import { BlockchainNetwork } from '@/common/enums';
import {
  EVM_CHAIN_DEFINITIONS,
  evmCaip2,
  isEvmBlockchainNetwork,
} from '@/common/constants/evm-chain-definitions';

/** CAIP-2 for WalletConnect init / session validation (EVM + Solana + Tron). */
export function wcCaip2ForChain(chain: BlockchainNetwork): string {
  const evm = evmCaip2(chain);
  if (evm) return evm;
  switch (chain) {
    case BlockchainNetwork.SOLANA_MAINNET:
      return 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';
    case BlockchainNetwork.SOLANA_DEVNET:
      return 'solana:EtWTRAB9YDFxGeBnSP6rg6DhzZZHc7yBtomxv2kXyPwb';
    case BlockchainNetwork.TRON_MAINNET:
      return 'tron:0x2b6653dc';
    case BlockchainNetwork.TRON_NILE:
      return 'tron:0xcd8690dc';
    case BlockchainNetwork.TRON_SHASTA:
      return 'tron:0x94a8759';
    default:
      throw new BadRequestException(
        `Chain "${chain}" không được hỗ trợ qua WalletConnect.`,
        'WC_CHAIN_NOT_SUPPORTED',
      );
  }
}

/** Chains that use SignClient + relay (EVM + Solana). Tron uses legacy URI path. */
export const WC_RELAY_PAIRING_CHAINS: BlockchainNetwork[] = [
  ...EVM_CHAIN_DEFINITIONS.map((d) => d.network),
  BlockchainNetwork.SOLANA_MAINNET,
  BlockchainNetwork.SOLANA_DEVNET,
];

export function isWcEvmChain(chain: BlockchainNetwork): boolean {
  return isEvmBlockchainNetwork(chain);
}
