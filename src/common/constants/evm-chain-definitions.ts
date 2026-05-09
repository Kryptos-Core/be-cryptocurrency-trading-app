import type { BlockchainChainDbValue } from '@/common/constants/blockchain-chain-db';
import { BlockchainNetwork } from '@/common/enums';

/** Static EVM metadata for JsonRpcProvider instances (RPC key + chainId + treasury row code). */
export interface EvmChainDefinition {
  network: BlockchainNetwork;
  chainId: number;
  rpcConfigKey: string;
  treasuryChain: BlockchainChainDbValue;
  nativeSymbol: string;
  defaultRpcUrl: string;
}

export const EVM_CHAIN_DEFINITIONS: readonly EvmChainDefinition[] = [
  {
    network: BlockchainNetwork.ETH_MAINNET,
    chainId: 1,
    rpcConfigKey: 'ETH_MAINNET_RPC_URL',
    treasuryChain: 'ETH_MAINNET',
    nativeSymbol: 'ETH',
    defaultRpcUrl: 'https://ethereum.publicnode.com',
  },
  {
    network: BlockchainNetwork.ETH_SEPOLIA,
    chainId: 11155111,
    rpcConfigKey: 'ETH_SEPOLIA_RPC_URL',
    treasuryChain: 'ETH_SEPOLIA',
    nativeSymbol: 'ETH',
    defaultRpcUrl: 'https://rpc.sepolia.org',
  },
  {
    network: BlockchainNetwork.BSC_MAINNET,
    chainId: 56,
    rpcConfigKey: 'BSC_MAINNET_RPC_URL',
    treasuryChain: 'BSC_MAINNET',
    nativeSymbol: 'BNB',
    defaultRpcUrl: 'https://bsc.publicnode.com',
  },
  {
    network: BlockchainNetwork.BSC_CHAPEL,
    chainId: 97,
    rpcConfigKey: 'BSC_CHAPEL_RPC_URL',
    treasuryChain: 'BSC_CHAPEL',
    nativeSymbol: 'BNB',
    defaultRpcUrl: 'https://bsc-testnet.publicnode.com',
  },
  {
    network: BlockchainNetwork.BASE_MAINNET,
    chainId: 8453,
    rpcConfigKey: 'BASE_MAINNET_RPC_URL',
    treasuryChain: 'BASE_MAINNET',
    nativeSymbol: 'ETH',
    defaultRpcUrl: 'https://base.publicnode.com',
  },
  {
    network: BlockchainNetwork.BASE_SEPOLIA,
    chainId: 84532,
    rpcConfigKey: 'BASE_SEPOLIA_RPC_URL',
    treasuryChain: 'BASE_SEPOLIA',
    nativeSymbol: 'ETH',
    defaultRpcUrl: 'https://sepolia.base.org',
  },
  {
    network: BlockchainNetwork.ARBITRUM_MAINNET,
    chainId: 42161,
    rpcConfigKey: 'ARBITRUM_MAINNET_RPC_URL',
    treasuryChain: 'ARBITRUM_MAINNET',
    nativeSymbol: 'ETH',
    defaultRpcUrl: 'https://arbitrum.publicnode.com',
  },
  {
    network: BlockchainNetwork.ARBITRUM_SEPOLIA,
    chainId: 421614,
    rpcConfigKey: 'ARBITRUM_SEPOLIA_RPC_URL',
    treasuryChain: 'ARBITRUM_SEPOLIA',
    nativeSymbol: 'ETH',
    defaultRpcUrl: 'https://arbitrum-sepolia.publicnode.com',
  },
  {
    network: BlockchainNetwork.OPTIMISM_MAINNET,
    chainId: 10,
    rpcConfigKey: 'OPTIMISM_MAINNET_RPC_URL',
    treasuryChain: 'OPTIMISM_MAINNET',
    nativeSymbol: 'ETH',
    defaultRpcUrl: 'https://optimism.publicnode.com',
  },
  {
    network: BlockchainNetwork.OPTIMISM_SEPOLIA,
    chainId: 11155420,
    rpcConfigKey: 'OPTIMISM_SEPOLIA_RPC_URL',
    treasuryChain: 'OPTIMISM_SEPOLIA',
    nativeSymbol: 'ETH',
    defaultRpcUrl: 'https://optimism-sepolia.publicnode.com',
  },
  {
    network: BlockchainNetwork.POLYGON_MAINNET,
    chainId: 137,
    rpcConfigKey: 'POLYGON_MAINNET_RPC_URL',
    treasuryChain: 'POLYGON_MAINNET',
    nativeSymbol: 'POL',
    defaultRpcUrl: 'https://polygon.publicnode.com',
  },
  {
    network: BlockchainNetwork.POLYGON_AMOY,
    chainId: 80002,
    rpcConfigKey: 'POLYGON_AMOY_RPC_URL',
    treasuryChain: 'POLYGON_AMOY',
    nativeSymbol: 'POL',
    defaultRpcUrl: 'https://rpc-amoy.polygon.technology',
  },
  {
    network: BlockchainNetwork.AVALANCHE_MAINNET,
    chainId: 43114,
    rpcConfigKey: 'AVALANCHE_MAINNET_RPC_URL',
    treasuryChain: 'AVALANCHE_MAINNET',
    nativeSymbol: 'AVAX',
    defaultRpcUrl: 'https://avalanche.publicnode.com/ext/bc/C/rpc',
  },
  {
    network: BlockchainNetwork.AVALANCHE_FUJI,
    chainId: 43113,
    rpcConfigKey: 'AVALANCHE_FUJI_RPC_URL',
    treasuryChain: 'AVALANCHE_FUJI',
    nativeSymbol: 'AVAX',
    defaultRpcUrl: 'https://api.avax-test.network/ext/bc/C/rpc',
  },
  {
    network: BlockchainNetwork.GNOSIS_MAINNET,
    chainId: 100,
    rpcConfigKey: 'GNOSIS_MAINNET_RPC_URL',
    treasuryChain: 'GNOSIS_MAINNET',
    nativeSymbol: 'XDAI',
    defaultRpcUrl: 'https://gnosis.publicnode.com',
  },
  {
    network: BlockchainNetwork.GNOSIS_CHIADO,
    chainId: 10200,
    rpcConfigKey: 'GNOSIS_CHIADO_RPC_URL',
    treasuryChain: 'GNOSIS_CHIADO',
    nativeSymbol: 'XDAI',
    defaultRpcUrl: 'https://gnosis-chiado.publicnode.com',
  },
  {
    network: BlockchainNetwork.LINEA_MAINNET,
    chainId: 59144,
    rpcConfigKey: 'LINEA_MAINNET_RPC_URL',
    treasuryChain: 'LINEA_MAINNET',
    nativeSymbol: 'ETH',
    defaultRpcUrl: 'https://linea.publicnode.com',
  },
  {
    network: BlockchainNetwork.LINEA_SEPOLIA,
    chainId: 59141,
    rpcConfigKey: 'LINEA_SEPOLIA_RPC_URL',
    treasuryChain: 'LINEA_SEPOLIA',
    nativeSymbol: 'ETH',
    defaultRpcUrl: 'https://rpc.sepolia.linea.build',
  },
  {
    network: BlockchainNetwork.FANTOM_MAINNET,
    chainId: 250,
    rpcConfigKey: 'FANTOM_MAINNET_RPC_URL',
    treasuryChain: 'FANTOM_MAINNET',
    nativeSymbol: 'FTM',
    defaultRpcUrl: 'https://fantom.publicnode.com',
  },
  {
    network: BlockchainNetwork.FANTOM_TESTNET,
    chainId: 4002,
    rpcConfigKey: 'FANTOM_TESTNET_RPC_URL',
    treasuryChain: 'FANTOM_TESTNET',
    nativeSymbol: 'FTM',
    defaultRpcUrl: 'https://rpc.testnet.fantom.network',
  },
] as const;

const byNetwork = new Map<BlockchainNetwork, EvmChainDefinition>(
  EVM_CHAIN_DEFINITIONS.map((d) => [d.network, d]),
);

export function getEvmChainDefinition(network: BlockchainNetwork): EvmChainDefinition | undefined {
  return byNetwork.get(network);
}

/** Resolve static EVM metadata by treasury / DB chain code (e.g. POLYGON_MAINNET). */
export function getEvmDefinitionByTreasuryChain(
  treasuryChain: string,
): EvmChainDefinition | undefined {
  return EVM_CHAIN_DEFINITIONS.find((d) => d.treasuryChain === treasuryChain);
}

export function isEvmTreasuryChain(treasuryChain: string): boolean {
  return getEvmDefinitionByTreasuryChain(treasuryChain) !== undefined;
}

export function isEvmBlockchainNetwork(network: BlockchainNetwork): boolean {
  return byNetwork.has(network);
}

export function evmCaip2(network: BlockchainNetwork): string | undefined {
  const d = byNetwork.get(network);
  if (!d) return undefined;
  return `eip155:${d.chainId}`;
}
