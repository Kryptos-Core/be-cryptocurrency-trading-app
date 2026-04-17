import type { MigrationInterface, QueryRunner } from 'typeorm';

export class DepositWatcherCursorsAndOnchainLogIndex1776520000000 implements MigrationInterface {
  name = 'DepositWatcherCursorsAndOnchainLogIndex1776520000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS deposit_watcher_cursors (
        chain VARCHAR(64) NOT NULL,
        cursor_value BIGINT NOT NULL DEFAULT 0,
        cursor_kind VARCHAR(32) NOT NULL DEFAULT 'TIMESTAMP_MS',
        updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (chain)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await queryRunner.query(`
      ALTER TABLE onchain_transactions
      ADD COLUMN log_index INT NOT NULL DEFAULT 0 AFTER tx_hash
    `);

    await queryRunner.query(`ALTER TABLE onchain_transactions DROP INDEX uk_onchain_tx_hash`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX uk_onchain_tx_chain_hash_log
      ON onchain_transactions (chain, tx_hash(128), log_index)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE onchain_transactions DROP INDEX uk_onchain_tx_chain_hash_log`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX uk_onchain_tx_hash ON onchain_transactions (chain, tx_hash(128))
    `);
    await queryRunner.query(`ALTER TABLE onchain_transactions DROP COLUMN log_index`);
    await queryRunner.query(`DROP TABLE IF EXISTS deposit_watcher_cursors`);
  }
}
