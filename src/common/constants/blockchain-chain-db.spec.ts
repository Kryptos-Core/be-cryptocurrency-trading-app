import { BLOCKCHAIN_CHAIN_DB_VALUES } from './blockchain-chain-db';

describe('BLOCKCHAIN_CHAIN_DB_VALUES', () => {
  it('does not include deprecated ETH_SEPOLIA', () => {
    expect(BLOCKCHAIN_CHAIN_DB_VALUES).not.toContain('ETH_SEPOLIA');
  });

  it('matches the MySQL chain enum used after RemoveEthSepolia migration', () => {
    expect([...BLOCKCHAIN_CHAIN_DB_VALUES].sort()).toEqual(
      [
        'BSC_CHAPEL',
        'BSC_MAINNET',
        'ETH_MAINNET',
        'SOLANA_DEVNET',
        'SOLANA_MAINNET',
        'TRON_MAINNET',
        'TRON_NILE',
        'TRON_SHASTA',
      ].sort(),
    );
  });
});
