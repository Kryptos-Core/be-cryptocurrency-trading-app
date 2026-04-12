import type { MigrationInterface, QueryRunner } from 'typeorm';

const expandedChainEnum = `'TRON_NILE','TRON_SHASTA','TRON_MAINNET','SOLANA_DEVNET','SOLANA_MAINNET','ETH_SEPOLIA','ETH_MAINNET','BSC_MAINNET'`;
const finalChainEnum = `'TRON_MAINNET','SOLANA_MAINNET','ETH_MAINNET','BSC_MAINNET'`;

/**
 * Collapse on-chain networks to mainnet-only domain.
 * Adds BSC_MAINNET and payment_method_configs.type BSC.
 */
export class MainnetOnlyBlockchainChains1775520000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE payment_method_configs
      MODIFY COLUMN type ENUM('PAYOS','ETH','TRON','SOL','BSC') NOT NULL
    `);

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

    for (const t of tables) {
      await queryRunner.query(
        `UPDATE \`${t}\` SET \`chain\` = 'TRON_MAINNET' WHERE \`chain\` IN ('TRON_NILE','TRON_SHASTA')`,
      );
      await queryRunner.query(
        `UPDATE \`${t}\` SET \`chain\` = 'SOLANA_MAINNET' WHERE \`chain\` = 'SOLANA_DEVNET'`,
      );
      await queryRunner.query(
        `UPDATE \`${t}\` SET \`chain\` = 'ETH_MAINNET' WHERE \`chain\` = 'ETH_SEPOLIA'`,
      );
    }

    for (const t of tables) {
      await queryRunner.query(
        `ALTER TABLE \`${t}\` MODIFY COLUMN \`chain\` ENUM(${finalChainEnum}) NOT NULL`,
      );
    }

    /** Đổi PK `key`: nếu đích đã tồn tại thì xóa bản ghi nguồn (giữ mainnet), tránh ER_DUP_ENTRY. */
    const systemConfigKeyRenames: [fromKey: string, toKey: string][] = [
      ['TRON_NILE_FULL_HOST', 'TRON_MAINNET_FULL_HOST'],
      ['SOLANA_DEVNET_URL', 'SOLANA_MAINNET_URL'],
      ['ETH_SEPOLIA_RPC_URL', 'ETH_MAINNET_RPC_URL'],
      ['ETH_SEPOLIA_CHAIN_ID', 'ETH_MAINNET_CHAIN_ID'],
      ['BLOCKCHAIN_WITHDRAW_AUTO_MAX_ETH_SEPOLIA', 'BLOCKCHAIN_WITHDRAW_AUTO_MAX_ETH_MAINNET'],
      ['BLOCKCHAIN_WITHDRAW_AUTO_MAX_SOLANA_DEVNET', 'BLOCKCHAIN_WITHDRAW_AUTO_MAX_SOLANA_MAINNET'],
      ['BLOCKCHAIN_WITHDRAW_AUTO_MAX_TRON_NILE', 'BLOCKCHAIN_WITHDRAW_AUTO_MAX_TRON_MAINNET'],
    ];

    for (const [fromKey, toKey] of systemConfigKeyRenames) {
      await queryRunner.query(
        `DELETE s1 FROM system_configs s1
         INNER JOIN system_configs s2 ON s2.\`key\` = ?
         WHERE s1.\`key\` = ?`,
        [toKey, fromKey],
      );
      await queryRunner.query(`UPDATE system_configs SET \`key\` = ? WHERE \`key\` = ?`, [
        toKey,
        fromKey,
      ]);
    }

    await queryRunner.query(`
      DELETE FROM system_configs WHERE \`key\` IN ('TRON_SHASTA_FULL_HOST', 'TRON_DEFAULT_NETWORK')
    `);
    await queryRunner.query(`
      DELETE FROM system_configs WHERE \`key\` = 'BLOCKCHAIN_WITHDRAW_AUTO_MAX_TRON_SHASTA'
    `);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    throw new Error('MainnetOnlyBlockchainChains1775520000000 down() is not supported');
  }
}
