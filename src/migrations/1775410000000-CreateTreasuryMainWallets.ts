import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTreasuryMainWallets1775410000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`treasury_main_wallets\` (
        \`main_wallet_id\` char(36) NOT NULL,
        \`chain\` enum ('ETH_SEPOLIA', 'ETH_MAINNET', 'TRON_NILE', 'TRON_SHASTA', 'TRON_MAINNET') NOT NULL,
        \`address\` varchar(255) NOT NULL,
        \`encrypted_private_key\` text NOT NULL,
        \`label\` varchar(100) NULL,
        \`is_default\` tinyint NOT NULL DEFAULT 0,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        INDEX \`idx_tmw_chain\` (\`chain\`),
        INDEX \`idx_tmw_chain_default\` (\`chain\`, \`is_default\`),
        PRIMARY KEY (\`main_wallet_id\`)
      ) ENGINE=InnoDB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE `treasury_main_wallets`');
  }
}
