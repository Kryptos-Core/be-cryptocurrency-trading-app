import type { MigrationInterface, QueryRunner } from 'typeorm';

export class DepositWatcherCursorsAndOnchainLogIndex1776520000000 implements MigrationInterface {
  name = 'DepositWatcherCursorsAndOnchainLogIndex1776520000000';

  private async addColumnIfNotExists(
    queryRunner: QueryRunner,
    tableName: string,
    columnName: string,
    columnDefinitionSql: string,
  ): Promise<void> {
    if (await queryRunner.hasColumn(tableName, columnName)) {
      return;
    }

    await queryRunner.query(`ALTER TABLE ${tableName} ADD COLUMN ${columnDefinitionSql}`);
  }

  private async addIndexIfNotExists(
    queryRunner: QueryRunner,
    tableName: string,
    indexName: string,
    createIndexSql: string,
  ): Promise<void> {
    const dbRows: { db: string | null }[] = await queryRunner.query(`SELECT DATABASE() AS db`);
    const schema = dbRows[0]?.db;
    if (!schema) {
      await queryRunner.query(createIndexSql);
      return;
    }

    const rows: unknown[] = await queryRunner.query(
      `SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1`,
      [schema, tableName, indexName],
    );
    if (rows.length > 0) {
      return;
    }

    await queryRunner.query(createIndexSql);
  }

  private async dropIndexIfExists(
    queryRunner: QueryRunner,
    tableName: string,
    indexName: string,
  ): Promise<void> {
    const dbRows: { db: string | null }[] = await queryRunner.query(`SELECT DATABASE() AS db`);
    const schema = dbRows[0]?.db;
    if (!schema) {
      await queryRunner.query(`ALTER TABLE ${tableName} DROP INDEX ${indexName}`);
      return;
    }

    const rows: unknown[] = await queryRunner.query(
      `SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1`,
      [schema, tableName, indexName],
    );
    if (rows.length === 0) {
      return;
    }

    await queryRunner.query(`ALTER TABLE ${tableName} DROP INDEX ${indexName}`);
  }

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

    await this.addColumnIfNotExists(
      queryRunner,
      'onchain_transactions',
      'log_index',
      '`log_index` INT NOT NULL DEFAULT 0 AFTER `tx_hash`',
    );

    await this.dropIndexIfExists(queryRunner, 'onchain_transactions', 'uk_onchain_tx_hash');
    await this.addIndexIfNotExists(
      queryRunner,
      'onchain_transactions',
      'uk_onchain_tx_chain_hash_log',
      'CREATE UNIQUE INDEX uk_onchain_tx_chain_hash_log ON onchain_transactions (chain, tx_hash(128), log_index)',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.dropIndexIfExists(queryRunner, 'onchain_transactions', 'uk_onchain_tx_chain_hash_log');
    await this.addIndexIfNotExists(
      queryRunner,
      'onchain_transactions',
      'uk_onchain_tx_hash',
      'CREATE UNIQUE INDEX uk_onchain_tx_hash ON onchain_transactions (chain, tx_hash(128))',
    );
    if (await queryRunner.hasColumn('onchain_transactions', 'log_index')) {
      await queryRunner.query(`ALTER TABLE onchain_transactions DROP COLUMN log_index`);
    }
    await queryRunner.query(`DROP TABLE IF EXISTS deposit_watcher_cursors`);
  }
}
