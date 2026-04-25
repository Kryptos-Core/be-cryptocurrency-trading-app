import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 3: Support UNMATCHED deposits — tx detected on-chain to our deposit address
 * but the sender wallet is not linked to any user account.
 *
 * - Make onchain_transactions.user_id nullable (unmatched rows have no user yet).
 * - Add UNMATCHED status enum value.
 * - Add index for admin queries on UNMATCHED rows.
 */
export class AddUnmatchedDepositSupport1776550000000 implements MigrationInterface {
  private isPostgres(queryRunner: QueryRunner): boolean {
    return queryRunner.connection.options.type === 'postgres';
  }

  name = 'AddUnmatchedDepositSupport1776550000000';

  private async ensureIndex(
    queryRunner: QueryRunner,
    tableName: string,
    indexName: string,
    indexColumns: string[],
    addIndexClause: string,
  ): Promise<void> {
    const dbRows: { db: string | null }[] = await queryRunner.query(`SELECT DATABASE() AS db`);
    const schema = dbRows[0]?.db;
    if (!schema) {
      await queryRunner.query(`ALTER TABLE \`${tableName}\` ${addIndexClause}`);
      return;
    }

    const rows: { column_list: string | null }[] = await queryRunner.query(
      `SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX SEPARATOR ',') AS column_list
       FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?
       GROUP BY INDEX_NAME`,
      [schema, tableName, indexName],
    );

    const expectedColumns = indexColumns.join(',');
    const existingColumns = rows[0]?.column_list;
    if (existingColumns === expectedColumns) {
      return;
    }

    if (existingColumns) {
      await queryRunner.query(`ALTER TABLE \`${tableName}\` DROP INDEX \`${indexName}\``);
    }

    await queryRunner.query(`ALTER TABLE \`${tableName}\` ${addIndexClause}`);
  }

  private async dropIndexIfExists(
    queryRunner: QueryRunner,
    tableName: string,
    indexName: string,
  ): Promise<void> {
    const dbRows: { db: string | null }[] = await queryRunner.query(`SELECT DATABASE() AS db`);
    const schema = dbRows[0]?.db;
    if (!schema) {
      await queryRunner.query(`ALTER TABLE \`${tableName}\` DROP INDEX \`${indexName}\``);
      return;
    }

    const rows: unknown[] = await queryRunner.query(
      `SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1`,
      [schema, tableName, indexName],
    );
    if (rows.length === 0) {
      return;
    }

    await queryRunner.query(`ALTER TABLE \`${tableName}\` DROP INDEX \`${indexName}\``);
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (this.isPostgres(queryRunner)) {
      return;
    }
    // Make user_id nullable for unmatched deposits.
    await queryRunner.query(`
      ALTER TABLE \`onchain_transactions\`
        MODIFY COLUMN \`user_id\` char(36) NULL DEFAULT NULL
    `);

    // Add UNMATCHED to status enum.
    await queryRunner.query(`
      ALTER TABLE \`onchain_transactions\`
        MODIFY COLUMN \`status\` enum('UNMATCHED','PENDING','CONFIRMING','COMPLETED','FAILED') NOT NULL DEFAULT 'PENDING'
    `);

    // Index for admin: find all UNMATCHED rows quickly.
    await this.ensureIndex(
      queryRunner,
      'onchain_transactions',
      'idx_onchain_tx_unmatched',
      ['status', 'created_at'],
      'ADD INDEX `idx_onchain_tx_unmatched` (`status`, `created_at`)',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (this.isPostgres(queryRunner)) {
      return;
    }
    await this.dropIndexIfExists(queryRunner, 'onchain_transactions', 'idx_onchain_tx_unmatched');

    // Revert status enum — rows with UNMATCHED would need manual cleanup first in prod.
    await queryRunner.query(`
      ALTER TABLE \`onchain_transactions\`
        MODIFY COLUMN \`status\` enum('PENDING','CONFIRMING','COMPLETED','FAILED') NOT NULL DEFAULT 'PENDING'
    `);

    // Revert user_id to NOT NULL — only safe if no NULL rows exist.
    await queryRunner.query(`
      ALTER TABLE \`onchain_transactions\`
        MODIFY COLUMN \`user_id\` char(36) NOT NULL
    `);
  }
}
