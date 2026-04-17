import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateReadOnchainDeposits1776400000000 implements MigrationInterface {
  name = 'CreateReadOnchainDeposits1776400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS read_onchain_deposits (
        tx_id CHAR(36) NOT NULL,
        user_id CHAR(36) NOT NULL,
        chain VARCHAR(64) NOT NULL,
        type VARCHAR(32) NOT NULL DEFAULT 'DEPOSIT',
        tx_hash VARCHAR(255) NULL,
        from_address VARCHAR(255) NOT NULL DEFAULT '',
        to_address VARCHAR(255) NOT NULL DEFAULT '',
        amount DECIMAL(36, 18) NOT NULL,
        status VARCHAR(32) NOT NULL,
        confirmations INT NOT NULL DEFAULT 0,
        settled TINYINT(1) NOT NULL DEFAULT 0,
        credited_currency_id CHAR(36) NULL,
        credited_amount DECIMAL(36, 18) NULL,
        conversion_rate DECIMAL(36, 18) NULL,
        created_at DATETIME(6) NOT NULL,
        confirmed_at DATETIME(6) NULL,
        last_outbox_id CHAR(36) NOT NULL,
        updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (tx_id),
        KEY idx_read_onchain_deposits_user_created (user_id, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS read_onchain_deposits');
  }
}
