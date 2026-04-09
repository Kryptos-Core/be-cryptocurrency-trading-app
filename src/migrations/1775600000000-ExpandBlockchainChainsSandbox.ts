import { MigrationInterface, QueryRunner } from 'typeorm';

/** Restores sandbox chain enum values alongside mainnets (no data rewrite). */
const expandedChainEnum = `'TRON_NILE','TRON_SHASTA','TRON_MAINNET','SOLANA_DEVNET','SOLANA_MAINNET','ETH_SEPOLIA','ETH_MAINNET','BSC_CHAPEL','BSC_MAINNET'`;

export class ExpandBlockchainChainsSandbox1775600000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const tables = [
      'linked_wallets',
      'onchain_transactions',
      'managed_wallets',
      'transaction_wallets',
      'treasury_operations',
      'treasury_main_wallets',
    ] as const;

    for (const t of tables) {
      await queryRunner.query(
        `ALTER TABLE \`${t}\` MODIFY COLUMN \`chain\` ENUM(${expandedChainEnum}) NOT NULL`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    throw new Error('ExpandBlockchainChainsSandbox1775600000000 down() is not supported');
  }
}
