import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateManagedWalletsTable1774600000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('managed_wallets');
    if (!table) {
      await queryRunner.query(`
        CREATE TABLE managed_wallets (
          wallet_id CHAR(36) NOT NULL,
          user_id CHAR(36) NOT NULL,
          chain ENUM('TRON_NILE', 'TRON_SHASTA') NOT NULL,
          address VARCHAR(255) NOT NULL,
          public_key VARCHAR(255) NOT NULL,
          encrypted_private_key TEXT NOT NULL,
          encrypted_seed_phrase TEXT NULL,
          label VARCHAR(100) NULL,
          is_default_deposit TINYINT(1) NOT NULL DEFAULT 0,
          default_set_at DATETIME NULL,
          is_active TINYINT(1) NOT NULL DEFAULT 1,
          created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
          PRIMARY KEY (wallet_id),
          CONSTRAINT fk_managed_wallet_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
          UNIQUE KEY uk_managed_wallet_user_chain_addr (user_id, chain, address),
          KEY idx_managed_wallet_chain_default (chain, is_default_deposit),
          KEY idx_managed_wallet_user_active (user_id, is_active)
        ) ENGINE=InnoDB
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('managed_wallets');
    if (table) {
      await queryRunner.query('DROP TABLE managed_wallets');
    }
  }
}
