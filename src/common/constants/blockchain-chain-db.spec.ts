import { BLOCKCHAIN_CHAIN_DB_VALUES } from './blockchain-chain-db';

describe('BLOCKCHAIN_CHAIN_DB_VALUES', () => {
  it('does not include deprecated ETH-only gap — Sepolia is supported again', () => {
    expect(BLOCKCHAIN_CHAIN_DB_VALUES).toContain('ETH_SEPOLIA');
  });

  it('matches the database chain enum used after ExpandMultichainEvmAndTon migration', () => {
    expect([...BLOCKCHAIN_CHAIN_DB_VALUES].sort()).toEqual(
      [
        'ARBITRUM_MAINNET',
        'ARBITRUM_SEPOLIA',
        'AVALANCHE_FUJI',
        'AVALANCHE_MAINNET',
        'BASE_MAINNET',
        'BASE_SEPOLIA',
        'BSC_CHAPEL',
        'BSC_MAINNET',
        'ETH_MAINNET',
        'ETH_SEPOLIA',
        'FANTOM_MAINNET',
        'FANTOM_TESTNET',
        'GNOSIS_CHIADO',
        'GNOSIS_MAINNET',
        'LINEA_MAINNET',
        'LINEA_SEPOLIA',
        'OPTIMISM_MAINNET',
        'OPTIMISM_SEPOLIA',
        'POLYGON_AMOY',
        'POLYGON_MAINNET',
        'SOLANA_DEVNET',
        'SOLANA_MAINNET',
        'TON_MAINNET',
        'TON_TESTNET',
        'TRON_MAINNET',
        'TRON_NILE',
        'TRON_SHASTA',
      ].sort(),
    );
  });
});
