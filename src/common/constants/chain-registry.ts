import { getEvmChainDefinition } from '@/common/constants/evm-chain-definitions';
import { BlockchainNetwork } from '@/common/enums';

export type ChainFamily = 'evm' | 'solana' | 'tron' | 'ton';

export interface ChainNetworkCatalogItemDto {
  code: string;
  iconKey: string;
  family: ChainFamily;
  isTestnet: boolean;
  sortOrder: number;
  capabilities: {
    deposit: boolean;
    withdraw: boolean;
    linkWallet: boolean;
  };
  phaseMessage?: string | null;
}

const TON_PHASE_MSG = 'TON — Phase 2 (TonConnect / indexer)';

function isTon(network: BlockchainNetwork): boolean {
  return network === BlockchainNetwork.TON_MAINNET || network === BlockchainNetwork.TON_TESTNET;
}

/** Matches product network sheet order (after “All chains”, FE-only). */
const PRODUCTION_UI_ORDER: BlockchainNetwork[] = [
  BlockchainNetwork.TON_MAINNET,
  BlockchainNetwork.BSC_MAINNET,
  BlockchainNetwork.SOLANA_MAINNET,
  BlockchainNetwork.ETH_MAINNET,
  BlockchainNetwork.BASE_MAINNET,
  BlockchainNetwork.ARBITRUM_MAINNET,
  BlockchainNetwork.OPTIMISM_MAINNET,
  BlockchainNetwork.POLYGON_MAINNET,
  BlockchainNetwork.AVALANCHE_MAINNET,
  BlockchainNetwork.GNOSIS_MAINNET,
  BlockchainNetwork.LINEA_MAINNET,
  BlockchainNetwork.FANTOM_MAINNET,
  BlockchainNetwork.TRON_MAINNET,
];

/** Sandbox catalog rows except Tron — Tron testnets are appended via [sandboxUiOrder]. */
const SANDBOX_UI_ORDER_WITHOUT_TRON: BlockchainNetwork[] = [
  BlockchainNetwork.TON_TESTNET,
  BlockchainNetwork.BSC_CHAPEL,
  BlockchainNetwork.SOLANA_DEVNET,
  BlockchainNetwork.ETH_SEPOLIA,
  BlockchainNetwork.BASE_SEPOLIA,
  BlockchainNetwork.ARBITRUM_SEPOLIA,
  BlockchainNetwork.OPTIMISM_SEPOLIA,
  BlockchainNetwork.POLYGON_AMOY,
  BlockchainNetwork.AVALANCHE_FUJI,
  BlockchainNetwork.GNOSIS_CHIADO,
  BlockchainNetwork.LINEA_SEPOLIA,
  BlockchainNetwork.FANTOM_TESTNET,
];

export function resolveSandboxTronNetworkEnum(
  tronDefaultNetwork?: string,
): BlockchainNetwork.TRON_NILE | BlockchainNetwork.TRON_SHASTA {
  const u = tronDefaultNetwork?.trim().toUpperCase();
  if (u === 'TRON_SHASTA') return BlockchainNetwork.TRON_SHASTA;
  return BlockchainNetwork.TRON_NILE;
}

/**
 * Sandbox exposes **both** Tron testnets (Nile + Shasta) so traders/QC can pick the network
 * for WC QR / deposits; order puts `TRON_DEFAULT_NETWORK` first.
 */
function sandboxUiOrder(tronDefaultNetwork?: string): BlockchainNetwork[] {
  const defaultTron = resolveSandboxTronNetworkEnum(tronDefaultNetwork);
  const secondaryTron =
    defaultTron === BlockchainNetwork.TRON_SHASTA
      ? BlockchainNetwork.TRON_NILE
      : BlockchainNetwork.TRON_SHASTA;
  return [...SANDBOX_UI_ORDER_WITHOUT_TRON, defaultTron, secondaryTron];
}

function chainFamily(network: BlockchainNetwork): ChainFamily {
  if (isTon(network)) return 'ton';
  if (network === BlockchainNetwork.SOLANA_MAINNET || network === BlockchainNetwork.SOLANA_DEVNET) {
    return 'solana';
  }
  if (
    network === BlockchainNetwork.TRON_MAINNET ||
    network === BlockchainNetwork.TRON_NILE ||
    network === BlockchainNetwork.TRON_SHASTA
  ) {
    return 'tron';
  }
  return 'evm';
}

function blockchainLabel(network: BlockchainNetwork): string {
  switch (network) {
    case BlockchainNetwork.TON_MAINNET:
    case BlockchainNetwork.TON_TESTNET:
      return 'TON';
    case BlockchainNetwork.BSC_MAINNET:
    case BlockchainNetwork.BSC_CHAPEL:
      return 'BNB Smart Chain';
    case BlockchainNetwork.SOLANA_MAINNET:
    case BlockchainNetwork.SOLANA_DEVNET:
      return 'Solana';
    case BlockchainNetwork.ETH_MAINNET:
    case BlockchainNetwork.ETH_SEPOLIA:
      return 'Ethereum';
    case BlockchainNetwork.BASE_MAINNET:
    case BlockchainNetwork.BASE_SEPOLIA:
      return 'Base';
    case BlockchainNetwork.ARBITRUM_MAINNET:
    case BlockchainNetwork.ARBITRUM_SEPOLIA:
      return 'Arbitrum';
    case BlockchainNetwork.OPTIMISM_MAINNET:
    case BlockchainNetwork.OPTIMISM_SEPOLIA:
      return 'Optimism';
    case BlockchainNetwork.POLYGON_MAINNET:
    case BlockchainNetwork.POLYGON_AMOY:
      return 'Polygon';
    case BlockchainNetwork.AVALANCHE_MAINNET:
    case BlockchainNetwork.AVALANCHE_FUJI:
      return 'Avalanche';
    case BlockchainNetwork.GNOSIS_MAINNET:
    case BlockchainNetwork.GNOSIS_CHIADO:
      return 'Gnosis';
    case BlockchainNetwork.LINEA_MAINNET:
    case BlockchainNetwork.LINEA_SEPOLIA:
      return 'Linea';
    case BlockchainNetwork.FANTOM_MAINNET:
    case BlockchainNetwork.FANTOM_TESTNET:
      return 'Fantom';
    case BlockchainNetwork.TRON_MAINNET:
    case BlockchainNetwork.TRON_NILE:
    case BlockchainNetwork.TRON_SHASTA:
      return 'Tron';
    default:
      return String(network);
  }
}

function networkLabel(network: BlockchainNetwork): string {
  switch (network) {
    case BlockchainNetwork.TRON_MAINNET:
    case BlockchainNetwork.SOLANA_MAINNET:
    case BlockchainNetwork.ETH_MAINNET:
    case BlockchainNetwork.BSC_MAINNET:
    case BlockchainNetwork.BASE_MAINNET:
    case BlockchainNetwork.OPTIMISM_MAINNET:
    case BlockchainNetwork.POLYGON_MAINNET:
    case BlockchainNetwork.LINEA_MAINNET:
    case BlockchainNetwork.FANTOM_MAINNET:
    case BlockchainNetwork.TON_MAINNET:
      return 'mainnet';
    case BlockchainNetwork.TRON_NILE:
      return 'Nile';
    case BlockchainNetwork.TRON_SHASTA:
      return 'Shasta';
    case BlockchainNetwork.SOLANA_DEVNET:
      return 'devnet';
    case BlockchainNetwork.ETH_SEPOLIA:
    case BlockchainNetwork.BASE_SEPOLIA:
    case BlockchainNetwork.ARBITRUM_SEPOLIA:
    case BlockchainNetwork.OPTIMISM_SEPOLIA:
    case BlockchainNetwork.LINEA_SEPOLIA:
      return 'Sepolia';
    case BlockchainNetwork.BSC_CHAPEL:
      return 'Chapel';
    case BlockchainNetwork.ARBITRUM_MAINNET:
      return 'One';
    case BlockchainNetwork.POLYGON_AMOY:
      return 'Amoy';
    case BlockchainNetwork.AVALANCHE_MAINNET:
      return 'C-Chain';
    case BlockchainNetwork.AVALANCHE_FUJI:
      return 'Fuji';
    case BlockchainNetwork.GNOSIS_MAINNET:
      return 'Chain';
    case BlockchainNetwork.GNOSIS_CHIADO:
      return 'Chiado';
    case BlockchainNetwork.FANTOM_TESTNET:
    case BlockchainNetwork.TON_TESTNET:
      return 'testnet';
    default:
      return String(network);
  }
}
function iconKey(network: BlockchainNetwork): string {
  switch (network) {
    case BlockchainNetwork.TON_MAINNET:
    case BlockchainNetwork.TON_TESTNET:
      return 'ton';
    case BlockchainNetwork.BSC_MAINNET:
    case BlockchainNetwork.BSC_CHAPEL:
      return 'bnb';
    case BlockchainNetwork.SOLANA_MAINNET:
    case BlockchainNetwork.SOLANA_DEVNET:
      return 'solana';
    case BlockchainNetwork.ETH_MAINNET:
    case BlockchainNetwork.ETH_SEPOLIA:
      return 'ethereum';
    case BlockchainNetwork.BASE_MAINNET:
    case BlockchainNetwork.BASE_SEPOLIA:
      return 'base';
    case BlockchainNetwork.ARBITRUM_MAINNET:
    case BlockchainNetwork.ARBITRUM_SEPOLIA:
      return 'arbitrum';
    case BlockchainNetwork.OPTIMISM_MAINNET:
    case BlockchainNetwork.OPTIMISM_SEPOLIA:
      return 'optimism';
    case BlockchainNetwork.POLYGON_MAINNET:
    case BlockchainNetwork.POLYGON_AMOY:
      return 'polygon';
    case BlockchainNetwork.AVALANCHE_MAINNET:
    case BlockchainNetwork.AVALANCHE_FUJI:
      return 'avalanche';
    case BlockchainNetwork.GNOSIS_MAINNET:
    case BlockchainNetwork.GNOSIS_CHIADO:
      return 'gnosis';
    case BlockchainNetwork.LINEA_MAINNET:
    case BlockchainNetwork.LINEA_SEPOLIA:
      return 'linea';
    case BlockchainNetwork.FANTOM_MAINNET:
    case BlockchainNetwork.FANTOM_TESTNET:
      return 'fantom';
    case BlockchainNetwork.TRON_MAINNET:
    case BlockchainNetwork.TRON_NILE:
    case BlockchainNetwork.TRON_SHASTA:
      return 'tron';
    default:
      return 'evm';
  }
}

function isTestnetChain(network: BlockchainNetwork): boolean {
  switch (network) {
    case BlockchainNetwork.TRON_NILE:
    case BlockchainNetwork.TRON_SHASTA:
    case BlockchainNetwork.SOLANA_DEVNET:
    case BlockchainNetwork.BSC_CHAPEL:
    case BlockchainNetwork.ETH_SEPOLIA:
    case BlockchainNetwork.BASE_SEPOLIA:
    case BlockchainNetwork.ARBITRUM_SEPOLIA:
    case BlockchainNetwork.OPTIMISM_SEPOLIA:
    case BlockchainNetwork.POLYGON_AMOY:
    case BlockchainNetwork.AVALANCHE_FUJI:
    case BlockchainNetwork.GNOSIS_CHIADO:
    case BlockchainNetwork.LINEA_SEPOLIA:
    case BlockchainNetwork.FANTOM_TESTNET:
    case BlockchainNetwork.TON_TESTNET:
      return true;
    default:
      return false;
  }
}

function capabilitiesFor(network: BlockchainNetwork): ChainNetworkCatalogItemDto['capabilities'] {
  if (isTon(network)) {
    return { deposit: false, withdraw: false, linkWallet: false };
  }
  return { deposit: true, withdraw: true, linkWallet: true };
}

export function buildNetworkCatalog(
  mainnetOnly: boolean,
  tronDefaultNetwork?: string,
): ChainNetworkCatalogItemDto[] {
  const order = mainnetOnly ? PRODUCTION_UI_ORDER : sandboxUiOrder(tronDefaultNetwork);
  return order.map((network, index) => {
    const caps = capabilitiesFor(network);
    return {
      code: network,
      iconKey: iconKey(network),
      family: chainFamily(network),
      blockchainKey: iconKey(network),
      blockchainLabel: blockchainLabel(network),
      networkLabel: networkLabel(network),
      isTestnet: isTestnetChain(network),
      sortOrder: (index + 1) * 10,
      capabilities: caps,
      phaseMessage: isTon(network) ? TON_PHASE_MSG : null,
    };
  });
}

/** Chains that have a working BlockchainProvider (excludes TON until Phase 2). */
export function listActionableOnchainChainCodes(
  mainnetOnly: boolean,
  tronDefaultNetwork?: string,
): string[] {
  return buildNetworkCatalog(mainnetOnly, tronDefaultNetwork)
    .filter((row) => row.capabilities.deposit)
    .map((row) => row.code);
}

export function nativeSymbolForChain(network: BlockchainNetwork): string {
  const evm = getEvmChainDefinition(network);
  if (evm) return evm.nativeSymbol;
  switch (network) {
    case BlockchainNetwork.SOLANA_MAINNET:
    case BlockchainNetwork.SOLANA_DEVNET:
      return 'SOL';
    case BlockchainNetwork.TRON_MAINNET:
    case BlockchainNetwork.TRON_NILE:
    case BlockchainNetwork.TRON_SHASTA:
      return 'TRX';
    case BlockchainNetwork.TON_MAINNET:
    case BlockchainNetwork.TON_TESTNET:
      return 'TON';
    default:
      throw new Error(`nativeSymbolForChain: unsupported ${network}`);
  }
}



