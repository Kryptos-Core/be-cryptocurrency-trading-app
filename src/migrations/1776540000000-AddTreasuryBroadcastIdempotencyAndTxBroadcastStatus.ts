import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 2: Add broadcast_idempotency_key + TX_BROADCAST status + updated_at to treasury_operations.
 *
 * - broadcast_idempotency_key: set BEFORE the RPC broadcast call; if set but tx_hash is NULL
 *   the worker knows a broadcast was attempted and can decide to re-broadcast or skip.
 * - TX_BROADCAST: intermediate status between PROCESSING and COMPLETED, so the confirm job
 *   can track that the tx was sent and just needs on-chain confirmation.
 * - updated_at: allows reconciliation job to detect stale TX_BROADCAST rows efficiently.
 */
export class AddTreasuryBroadcastIdempotencyAndTxBroadcastStatus1776540000000
  implements MigrationInterface
{
  name = 'AddTreasuryBroadcastIdempotencyAndTxBroadcastStatus1776540000000';

  private async addColumnIfNotExists(
    queryRunner: QueryRunner,
    tableName: string,
    columnName: string,
    columnDefinitionSql: string,
  ): Promise<void> {
    if (await queryRunner.hasColumn(tableName, columnName)) {
      await queryRunner.query(`ALTER TABLE \`${tableName}\` MODIFY COLUMN ${columnDefinitionSql}`);
      return;
    }

    await queryRunner.query(`ALTER TABLE \`${tableName}\` ADD COLUMN ${columnDefinitionSql}`);
  }

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

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.addColumnIfNotExists(
      queryRunner,
      'treasury_operations',
      'broadcast_idempotency_key',
      '`broadcast_idempotency_key` varchar(255) NULL DEFAULT NULL',
    );

    await this.addColumnIfNotExists(
      queryRunner,
      'treasury_operations',
      'updated_at',
      '`updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)',
    );

    // Add TX_BROADCAST to status enum — must re-specify all enum values for MySQL.
    await queryRunner.query(`
      ALTER TABLE \`treasury_operations\`
        MODIFY COLUMN \`status\` enum('PENDING','PROCESSING','TX_BROADCAST','COMPLETED','FAILED') NOT NULL DEFAULT 'PENDING'
    `);

    await this.ensureIndex(
      queryRunner,
      'treasury_operations',
      'idx_treasury_op_tx_broadcast_stale',
      ['status', 'updated_at'],
      'ADD INDEX `idx_treasury_op_tx_broadcast_stale` (`status`, `updated_at`)',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`treasury_operations\`
        DROP INDEX \`idx_treasury_op_tx_broadcast_stale\`
    `);

    // Revert status enum — rows with TX_BROADCAST would need manual cleanup first in prod.
    await queryRunner.query(`
      ALTER TABLE \`treasury_operations\`
        MODIFY COLUMN \`status\` enum('PENDING','PROCESSING','COMPLETED','FAILED') NOT NULL DEFAULT 'PENDING'
    `);

    await queryRunner.query(`
      ALTER TABLE \`treasury_operations\`
        DROP COLUMN \`broadcast_idempotency_key\`
    `);

    await queryRunner.query(`
      ALTER TABLE \`treasury_operations\`
        DROP COLUMN \`updated_at\`
    `);
  }
}
