import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Upgrade treasury_main_wallets:
 * 1. Extend chain enum: add SOL_DEVNET, SOL_MAINNET
 * 2. Add status column: PENDING_APPROVAL | ACTIVE | REJECTED (approval workflow)
 * 3. Add audit columns: created_by, approved_by, approved_at, rejected_by, rejected_at
 * 4. Add rotation tracking: last_rotated_at, rotation_interval_days
 * 5. Add unique index per (chain, address) to prevent duplicates
 */
export class UpgradeTreasuryMainWallets1775460000000 implements MigrationInterface {
  name = 'UpgradeTreasuryMainWallets1775460000000';

  private async addColumnIfNotExists(
    queryRunner: QueryRunner,
    tableName: string,
    columnName: string,
    columnDefinitionSql: string,
  ): Promise<void> {
    const dbRows: { db: string | null }[] = await queryRunner.query(`SELECT DATABASE() AS db`);
    const schema = dbRows[0]?.db;
    if (!schema) return;
    const rows: unknown[] = await queryRunner.query(
      `SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
      [schema, tableName, columnName],
    );
    if (rows.length === 0) {
      await queryRunner.query(`ALTER TABLE \`${tableName}\` ADD COLUMN ${columnDefinitionSql}`);
    }
  }

  private async addTableIndexIfNotExists(
    queryRunner: QueryRunner,
    tableName: string,
    indexName: string,
    alterTableClause: string,
  ): Promise<void> {
    const dbRows: { db: string | null }[] = await queryRunner.query(`SELECT DATABASE() AS db`);
    const schema = dbRows[0]?.db;
    if (!schema) return;
    const rows: unknown[] = await queryRunner.query(
      `SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1`,
      [schema, tableName, indexName],
    );
    if (rows.length === 0) {
      await queryRunner.query(`ALTER TABLE \`${tableName}\` ${alterTableClause}`);
    }
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Extend chain enum to include Solana (mỗi bảng một query — MySQL driver không chạy multi-statement)
    const chainEnumValues = `'ETH_SEPOLIA', 'ETH_MAINNET', 'TRON_NILE', 'TRON_SHASTA', 'TRON_MAINNET', 'SOLANA_DEVNET', 'SOLANA_MAINNET'`;
    for (const table of [
      'treasury_main_wallets',
      'transaction_wallets',
      'treasury_operations',
      'onchain_transactions',
    ] as const) {
      await queryRunner.query(
        `ALTER TABLE \`${table}\` MODIFY \`chain\` enum (${chainEnumValues}) NOT NULL`,
      );
    }

    // 2. Add status column for approval workflow
    await this.addColumnIfNotExists(
      queryRunner,
      'treasury_main_wallets',
      'status',
      `\`status\` enum ('PENDING_APPROVAL', 'ACTIVE', 'REJECTED') NOT NULL DEFAULT 'ACTIVE' AFTER \`is_default\``,
    );

    // 3. Add audit columns
    await this.addColumnIfNotExists(
      queryRunner,
      'treasury_main_wallets',
      'created_by',
      `\`created_by\` char(36) NULL AFTER \`status\``,
    );
    await this.addColumnIfNotExists(
      queryRunner,
      'treasury_main_wallets',
      'approved_by',
      `\`approved_by\` char(36) NULL AFTER \`created_by\``,
    );
    await this.addColumnIfNotExists(
      queryRunner,
      'treasury_main_wallets',
      'approved_at',
      `\`approved_at\` datetime(6) NULL AFTER \`approved_by\``,
    );
    await this.addColumnIfNotExists(
      queryRunner,
      'treasury_main_wallets',
      'rejected_by',
      `\`rejected_by\` char(36) NULL AFTER \`approved_at\``,
    );
    await this.addColumnIfNotExists(
      queryRunner,
      'treasury_main_wallets',
      'rejected_at',
      `\`rejected_at\` datetime(6) NULL AFTER \`rejected_by\``,
    );

    // 4. Add rotation tracking columns
    await this.addColumnIfNotExists(
      queryRunner,
      'treasury_main_wallets',
      'last_rotated_at',
      `\`last_rotated_at\` datetime(6) NULL`,
    );
    await this.addColumnIfNotExists(
      queryRunner,
      'treasury_main_wallets',
      'rotation_interval_days',
      `\`rotation_interval_days\` int UNSIGNED NULL DEFAULT NULL`,
    );

    // 5. Add unique constraint per chain+address
    await this.addTableIndexIfNotExists(
      queryRunner,
      'treasury_main_wallets',
      'uk_tmw_chain_address',
      `ADD UNIQUE INDEX \`uk_tmw_chain_address\` (\`chain\`, \`address\`)`,
    );

    // 6. Add index on status for fast queries
    await this.addTableIndexIfNotExists(
      queryRunner,
      'treasury_main_wallets',
      'idx_tmw_status',
      `ADD INDEX \`idx_tmw_status\` (\`status\`)`,
    );

    // 7. Existing seeded records from PaymentConfig: promote to ACTIVE
    await queryRunner.query(`
      UPDATE \`treasury_main_wallets\` SET \`status\` = 'ACTIVE' WHERE \`status\` = 'ACTIVE'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX \`idx_tmw_status\` ON \`treasury_main_wallets\``);
    await queryRunner.query(`DROP INDEX \`uk_tmw_chain_address\` ON \`treasury_main_wallets\``);
    await queryRunner.query(`
      ALTER TABLE \`treasury_main_wallets\`
        DROP COLUMN \`rotation_interval_days\`,
        DROP COLUMN \`last_rotated_at\`,
        DROP COLUMN \`rejected_at\`,
        DROP COLUMN \`rejected_by\`,
        DROP COLUMN \`approved_at\`,
        DROP COLUMN \`approved_by\`,
        DROP COLUMN \`created_by\`,
        DROP COLUMN \`status\`
    `);
    const chainRevertTmwTwTo = `enum ('ETH_SEPOLIA', 'ETH_MAINNET', 'TRON_NILE', 'TRON_SHASTA', 'TRON_MAINNET') NOT NULL`;
    await queryRunner.query(
      `ALTER TABLE \`treasury_main_wallets\` MODIFY \`chain\` ${chainRevertTmwTwTo}`,
    );
    await queryRunner.query(
      `ALTER TABLE \`transaction_wallets\` MODIFY \`chain\` ${chainRevertTmwTwTo}`,
    );
    await queryRunner.query(
      `ALTER TABLE \`treasury_operations\` MODIFY \`chain\` ${chainRevertTmwTwTo}`,
    );
    await queryRunner.query(`
      ALTER TABLE \`onchain_transactions\`
        MODIFY \`chain\` enum ('TRON_NILE', 'TRON_SHASTA', 'SOLANA_DEVNET', 'ETH_SEPOLIA') NOT NULL
    `);
  }
}
