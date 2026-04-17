import { BlockchainNetwork } from '@/common/enums';

/** Canonical USDT ERC-20 where the app supports automatic deposit scanning. */
export const EVM_USDT_CONTRACT: Partial<Record<BlockchainNetwork, `0x${string}`>> = {
  [BlockchainNetwork.ETH_MAINNET]: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  [BlockchainNetwork.ETH_SEPOLIA]: '0x7169D38820dfd117C3FA1f22a697dBA58d90BAE3',
  [BlockchainNetwork.BSC_MAINNET]: '0x55d398326f99059fF775485246999027B3197955',
  [BlockchainNetwork.BSC_CHAPEL]: '0x337610d27c582E487C5d60a566eAEEA8856bFc2d',
  [BlockchainNetwork.BASE_MAINNET]: '0xfde4C96c8593536E31F229EA8f37b2ADa2699f2',
  [BlockchainNetwork.BASE_SEPOLIA]: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  [BlockchainNetwork.ARBITRUM_MAINNET]: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
  [BlockchainNetwork.ARBITRUM_SEPOLIA]: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d',
  [BlockchainNetwork.OPTIMISM_MAINNET]: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58',
  [BlockchainNetwork.OPTIMISM_SEPOLIA]: '0x5fd84259d66Cd46123540766Be93DFE6D431aDdd',
  [BlockchainNetwork.POLYGON_MAINNET]: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
  [BlockchainNetwork.POLYGON_AMOY]: '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582',
  [BlockchainNetwork.AVALANCHE_MAINNET]: '0x9702230A8Ea53601f5cD2dc00fDBC13D4dF4A8c7',
  [BlockchainNetwork.AVALANCHE_FUJI]: '0x9702230A8Ea53601f5cD2dc00fDBC13D4dF4A8c7',
  [BlockchainNetwork.GNOSIS_MAINNET]: '0x4ECaBa5870353805a9F068101A40E0f32ed605C6',
  [BlockchainNetwork.GNOSIS_CHIADO]: '0xDDAfbb505ad214D7b80b1f830fcCc89B60fb7A83',
  [BlockchainNetwork.LINEA_MAINNET]: '0xA219439258ca9Da29E9Cc4cE7eE4337529785A75',
  [BlockchainNetwork.LINEA_SEPOLIA]: '0x78354f8Dc6c0bDc3be41B746a7D1fE2fc343E4f7',
  [BlockchainNetwork.FANTOM_MAINNET]: '0x049d68029688eAbF473097a2fC08ef5D3d277310',
  [BlockchainNetwork.FANTOM_TESTNET]: '0x812666209b32Fa2d9EaEe26D66CA55722ed1A90A',
};

/** Decimals for the mapped USDT contract (BSC mainnet USDT uses 18). */
export const EVM_USDT_DECIMALS: Partial<Record<BlockchainNetwork, number>> = {
  [BlockchainNetwork.BSC_MAINNET]: 18,
};

export function evmUsdtDecimals(network: BlockchainNetwork): number {
  return EVM_USDT_DECIMALS[network] ?? 6;
}
