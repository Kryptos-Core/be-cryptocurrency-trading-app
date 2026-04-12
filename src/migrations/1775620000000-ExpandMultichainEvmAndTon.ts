import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds EVM L1/L2 chains, Ethereum Sepolia (sandbox L1), and TON codes to MySQL chain ENUMs.
 */
const expandedChainEnum =
  "'ARBITRUM_MAINNET','ARBITRUM_SEPOLIA','AVALANCHE_FUJI','AVALANCHE_MAINNET','BASE_MAINNET','BASE_SEPOLIA','BSC_CHAPEL','BSC_MAINNET','ETH_MAINNET','ETH_SEPOLIA','FANTOM_MAINNET','FANTOM_TESTNET','GNOSIS_CHIADO','GNOSIS_MAINNET','LINEA_MAINNET','LINEA_SEPOLIA','OPTIMISM_MAINNET','OPTIMISM_SEPOLIA','POLYGON_AMOY','POLYGON_MAINNET','SOLANA_DEVNET','SOLANA_MAINNET','TON_MAINNET','TON_TESTNET','TRON_MAINNET','TRON_NILE','TRON_SHASTA'";

const chainTables = [
  'linked_wallets',
  'onchain_transactions',
  'managed_wallets',
  'transaction_wallets',
  'treasury_operations',
  'treasury_main_wallets',
] as const;

export class ExpandMultichainEvmAndTon1775620000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const t of chainTables) {
      await queryRunner.query(
        `ALTER TABLE \`${t}\` MODIFY COLUMN \`chain\` ENUM(${expandedChainEnum}) NOT NULL`,
      );
    }
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    throw new Error('ExpandMultichainEvmAndTon1775620000000 down() is not supported');
  }
}
