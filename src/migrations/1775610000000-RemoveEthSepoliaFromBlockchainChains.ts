import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Retire Ethereum Sepolia: rewrite rows to BSC Chapel, drop Sepolia from MySQL ENUMs,
 * and remove Sepolia-related runtime config keys.
 */
const chainEnumWithoutSepolia = `'TRON_NILE','TRON_SHASTA','TRON_MAINNET','SOLANA_DEVNET','SOLANA_MAINNET','ETH_MAINNET','BSC_CHAPEL','BSC_MAINNET'`;

const chainTables = [
  'linked_wallets',
  'onchain_transactions',
  'managed_wallets',
  'transaction_wallets',
  'treasury_operations',
  'treasury_main_wallets',
] as const;

export class RemoveEthSepoliaFromBlockchainChains1775610000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE lw1 FROM \`linked_wallets\` lw1
      INNER JOIN \`linked_wallets\` lw2
        ON lw1.user_id = lw2.user_id AND lw1.address = lw2.address AND lw2.chain = 'BSC_CHAPEL'
      WHERE lw1.chain = 'ETH_SEPOLIA'
    `);

    await queryRunner.query(`
      DELETE mw1 FROM \`managed_wallets\` mw1
      INNER JOIN \`managed_wallets\` mw2
        ON mw1.user_id = mw2.user_id AND mw1.address = mw2.address AND mw2.chain = 'BSC_CHAPEL'
      WHERE mw1.chain = 'ETH_SEPOLIA'
    `);

    await queryRunner.query(`
      DELETE tw1 FROM \`transaction_wallets\` tw1
      INNER JOIN \`transaction_wallets\` tw2
        ON tw1.address = tw2.address AND tw2.chain = 'BSC_CHAPEL'
      WHERE tw1.chain = 'ETH_SEPOLIA'
    `);

    await queryRunner.query(`
      DELETE tmw1 FROM \`treasury_main_wallets\` tmw1
      INNER JOIN \`treasury_main_wallets\` tmw2
        ON tmw1.address = tmw2.address AND tmw2.chain = 'BSC_CHAPEL'
      WHERE tmw1.chain = 'ETH_SEPOLIA'
    `);

    for (const t of chainTables) {
      await queryRunner.query(
        `UPDATE \`${t}\` SET \`chain\` = 'BSC_CHAPEL' WHERE \`chain\` = 'ETH_SEPOLIA'`,
      );
    }

    if (await queryRunner.hasTable('system_configs')) {
      await queryRunner.query(`
      DELETE FROM \`system_configs\` WHERE \`key\` IN (
        'ETH_SEPOLIA_RPC_URL',
        'ETH_SEPOLIA_CHAIN_ID',
        'BLOCKCHAIN_WITHDRAW_AUTO_MAX_ETH_SEPOLIA'
      )
    `);
    }

    for (const t of chainTables) {
      await queryRunner.query(
        `ALTER TABLE \`${t}\` MODIFY COLUMN \`chain\` ENUM(${chainEnumWithoutSepolia}) NOT NULL`,
      );
    }
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    throw new Error('RemoveEthSepoliaFromBlockchainChains1775610000000 down() is not supported');
  }
}
