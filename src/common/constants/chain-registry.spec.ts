import { BlockchainNetwork } from '@/common/enums';
import {
  buildNetworkCatalog,
  listActionableOnchainChainCodes,
  nativeSymbolForChain,
  resolveSandboxTronNetworkEnum,
} from './chain-registry';
import { EVM_CHAIN_DEFINITIONS, isEvmBlockchainNetwork } from './evm-chain-definitions';

describe('chain-registry', () => {
  it('lists TON first in production catalog with capabilities off', () => {
    const cat = buildNetworkCatalog(true);
    expect(cat[0].code).toBe(BlockchainNetwork.TON_MAINNET);
    expect(cat[0].capabilities.deposit).toBe(false);
    expect(cat[0].phaseMessage).toContain('Phase 2');
  });

  it('excludes TON from actionable deposit codes in production', () => {
    const codes = listActionableOnchainChainCodes(true);
    expect(codes).not.toContain(BlockchainNetwork.TON_MAINNET);
    expect(codes).toContain(BlockchainNetwork.ETH_MAINNET);
    expect(codes).toContain(BlockchainNetwork.BASE_MAINNET);
  });

  it('sandbox uses ETH_SEPOLIA and ends with configured Tron testnet', () => {
    const codes = listActionableOnchainChainCodes(false, 'TRON_SHASTA');
    expect(codes).toContain(BlockchainNetwork.ETH_SEPOLIA);
    expect(codes[codes.length - 1]).toBe(BlockchainNetwork.TRON_SHASTA);
  });

  it('resolveSandboxTronNetworkEnum respects TRON_SHASTA', () => {
    expect(resolveSandboxTronNetworkEnum('TRON_SHASTA')).toBe(BlockchainNetwork.TRON_SHASTA);
    expect(resolveSandboxTronNetworkEnum(undefined)).toBe(BlockchainNetwork.TRON_NILE);
  });

  it('nativeSymbolForChain covers Polygon and Gnosis', () => {
    expect(nativeSymbolForChain(BlockchainNetwork.POLYGON_MAINNET)).toBe('POL');
    expect(nativeSymbolForChain(BlockchainNetwork.GNOSIS_MAINNET)).toBe('XDAI');
  });
});

describe('evm-chain-definitions', () => {
  it('defines an entry for every EVM enum member', () => {
    const evmEnumMembers = Object.values(BlockchainNetwork).filter((n) => isEvmBlockchainNetwork(n));
    expect(new Set(evmEnumMembers).size).toBe(EVM_CHAIN_DEFINITIONS.length);
  });
});
