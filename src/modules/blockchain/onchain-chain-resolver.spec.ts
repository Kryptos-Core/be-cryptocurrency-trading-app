import {
  OnChainNetworkFamily,
  OnChainOperatorMode,
  BlockchainNetwork,
} from '@/common/enums';
import { resolveBlockchainNetwork } from './onchain-chain-resolver';

describe('resolveBlockchainNetwork', () => {
  const cases: Array<{
    family: OnChainNetworkFamily;
    mode: OnChainOperatorMode;
    expected: BlockchainNetwork;
  }> = [
    { family: OnChainNetworkFamily.TRON, mode: OnChainOperatorMode.PRODUCTION, expected: BlockchainNetwork.TRON_MAINNET },
    { family: OnChainNetworkFamily.TRON, mode: OnChainOperatorMode.SANDBOX, expected: BlockchainNetwork.TRON_NILE },
    { family: OnChainNetworkFamily.EVM_ETH, mode: OnChainOperatorMode.PRODUCTION, expected: BlockchainNetwork.ETH_MAINNET },
    { family: OnChainNetworkFamily.EVM_ETH, mode: OnChainOperatorMode.SANDBOX, expected: BlockchainNetwork.BSC_CHAPEL },
    { family: OnChainNetworkFamily.EVM_BSC, mode: OnChainOperatorMode.PRODUCTION, expected: BlockchainNetwork.BSC_MAINNET },
    { family: OnChainNetworkFamily.EVM_BSC, mode: OnChainOperatorMode.SANDBOX, expected: BlockchainNetwork.BSC_CHAPEL },
    { family: OnChainNetworkFamily.SOLANA, mode: OnChainOperatorMode.PRODUCTION, expected: BlockchainNetwork.SOLANA_MAINNET },
    { family: OnChainNetworkFamily.SOLANA, mode: OnChainOperatorMode.SANDBOX, expected: BlockchainNetwork.SOLANA_DEVNET },
  ];

  it.each(cases)(
    'maps $family + $mode → $expected',
    ({ family, mode, expected }) => {
      expect(resolveBlockchainNetwork(family, mode)).toBe(expected);
    },
  );
});
