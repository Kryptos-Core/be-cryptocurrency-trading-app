import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTreasuryWalletsAndOperations1775300000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`transaction_wallets\` (
        \`wallet_id\` char(36) NOT NULL,
        \`chain\` enum ('ETH_SEPOLIA', 'TRON_NILE', 'TRON_SHASTA') NOT NULL,
        \`address\` varchar(255) NOT NULL,
        \`purpose\` enum ('DEPOSIT', 'WITHDRAWAL', 'BOTH') NOT NULL DEFAULT 'BOTH',
        \`encrypted_private_key\` text NOT NULL,
        \`label\` varchar(100) NULL,
        \`is_active\` tinyint NOT NULL DEFAULT 1,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        UNIQUE INDEX \`uk_tx_wallet_chain_address\` (\`chain\`, \`address\`),
        INDEX \`idx_tx_wallet_chain_purpose\` (\`chain\`, \`purpose\`),
        INDEX \`idx_tx_wallet_chain_active\` (\`chain\`, \`is_active\`),
        PRIMARY KEY (\`wallet_id\`)
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE \`treasury_operations\` (
        \`operation_id\` char(36) NOT NULL,
        \`type\` enum ('SWEEP', 'FUND') NOT NULL,
        \`chain\` enum ('ETH_SEPOLIA', 'TRON_NILE', 'TRON_SHASTA') NOT NULL,
        \`from_wallet_id\` char(36) NULL,
        \`to_wallet_id\` char(36) NULL,
        \`amount\` decimal(36,18) NOT NULL DEFAULT '0.000000000000000000',
        \`tx_hash\` varchar(255) NULL,
        \`onchain_tx_id\` char(36) NULL,
        \`status\` enum ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED') NOT NULL DEFAULT 'PENDING',
        \`actor_user_id\` char(36) NOT NULL,
        \`failure_reason\` varchar(512) NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`completed_at\` datetime NULL,
        INDEX \`idx_treasury_op_chain_type_status\` (\`chain\`, \`type\`, \`status\`),
        INDEX \`idx_treasury_op_created\` (\`created_at\`),
        PRIMARY KEY (\`operation_id\`)
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      ALTER TABLE \`treasury_operations\`
      ADD CONSTRAINT \`FK_treasury_op_actor_user\` FOREIGN KEY (\`actor_user_id\`) REFERENCES \`users\`(\`user_id\`) ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE \`treasury_operations\`
      ADD CONSTRAINT \`FK_treasury_op_from_wallet\` FOREIGN KEY (\`from_wallet_id\`) REFERENCES \`transaction_wallets\`(\`wallet_id\`) ON DELETE SET NULL ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE \`treasury_operations\`
      ADD CONSTRAINT \`FK_treasury_op_to_wallet\` FOREIGN KEY (\`to_wallet_id\`) REFERENCES \`transaction_wallets\`(\`wallet_id\`) ON DELETE SET NULL ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE \`onchain_transactions\`
      MODIFY COLUMN \`type\` enum ('DEPOSIT', 'WITHDRAWAL', 'TRANSFER', 'SWEEP', 'FUND') NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE \`onchain_transactions\`
      ADD COLUMN \`treasury_operation_id\` char(36) NULL AFTER \`linked_wallet_id\`
    `);

    await queryRunner.query(`
      ALTER TABLE \`onchain_transactions\`
      ADD INDEX \`idx_onchain_tx_treasury_operation\` (\`treasury_operation_id\`)
    `);

    await queryRunner.query(`
      ALTER TABLE \`onchain_transactions\`
      ADD CONSTRAINT \`FK_onchain_tx_treasury_operation\` FOREIGN KEY (\`treasury_operation_id\`) REFERENCES \`treasury_operations\`(\`operation_id\`) ON DELETE SET NULL ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `onchain_transactions` DROP FOREIGN KEY `FK_onchain_tx_treasury_operation`',
    );
    await queryRunner.query(
      'ALTER TABLE `onchain_transactions` DROP INDEX `idx_onchain_tx_treasury_operation`',
    );
    await queryRunner.query(
      'ALTER TABLE `onchain_transactions` DROP COLUMN `treasury_operation_id`',
    );

    await queryRunner.query(`
      ALTER TABLE \`onchain_transactions\`
      MODIFY COLUMN \`type\` enum ('DEPOSIT', 'WITHDRAWAL', 'TRANSFER') NOT NULL
    `);

    await queryRunner.query(
      'ALTER TABLE `treasury_operations` DROP FOREIGN KEY `FK_treasury_op_to_wallet`',
    );
    await queryRunner.query(
      'ALTER TABLE `treasury_operations` DROP FOREIGN KEY `FK_treasury_op_from_wallet`',
    );
    await queryRunner.query(
      'ALTER TABLE `treasury_operations` DROP FOREIGN KEY `FK_treasury_op_actor_user`',
    );

    await queryRunner.query('DROP TABLE `treasury_operations`');
    await queryRunner.query('DROP TABLE `transaction_wallets`');
  }
}
