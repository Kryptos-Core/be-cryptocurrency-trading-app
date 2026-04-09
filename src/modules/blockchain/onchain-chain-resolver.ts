import {
  BlockchainNetwork,
  OnChainNetworkFamily,
  OnChainOperatorMode,
} from '@/common/enums';

/**
 * Map UI / ops "family" + deployment mode to the concrete chain enum stored in DB and used for WC CAIP-2.
 */
export function resolveBlockchainNetwork(
  family: OnChainNetworkFamily,
  mode: OnChainOperatorMode,
): BlockchainNetwork {
  if (mode === OnChainOperatorMode.PRODUCTION) {
    switch (family) {
      case OnChainNetworkFamily.TRON:
        return BlockchainNetwork.TRON_MAINNET;
      case OnChainNetworkFamily.EVM_ETH:
        return BlockchainNetwork.ETH_MAINNET;
      case OnChainNetworkFamily.EVM_BSC:
        return BlockchainNetwork.BSC_MAINNET;
      case OnChainNetworkFamily.SOLANA:
        return BlockchainNetwork.SOLANA_MAINNET;
      default: {
        const _exhaustive: never = family;
        return _exhaustive;
      }
    }
  }

  switch (family) {
    case OnChainNetworkFamily.TRON:
      return BlockchainNetwork.TRON_NILE;
    case OnChainNetworkFamily.EVM_ETH:
      return BlockchainNetwork.ETH_SEPOLIA;
    case OnChainNetworkFamily.EVM_BSC:
      return BlockchainNetwork.BSC_CHAPEL;
    case OnChainNetworkFamily.SOLANA:
      return BlockchainNetwork.SOLANA_DEVNET;
    default: {
      const _exhaustive: never = family;
      return _exhaustive;
    }
  }
}
