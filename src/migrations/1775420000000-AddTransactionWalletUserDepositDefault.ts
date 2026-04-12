import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Unifies user-facing deposit defaults with transaction_wallets:
 * - Adds is_default_user_deposit / default_set_at
 * - Backfills from managed_wallets (match chain+address; import missing rows)
 */
export class AddTransactionWalletUserDepositDefault1775420000000 implements MigrationInterface {
  name = 'AddTransactionWalletUserDepositDefault1775420000000';

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

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.addColumnIfNotExists(
      queryRunner,
      'transaction_wallets',
      'is_default_user_deposit',
      `\`is_default_user_deposit\` tinyint NOT NULL DEFAULT 0`,
    );
    await this.addColumnIfNotExists(
      queryRunner,
      'transaction_wallets',
      'default_set_at',
      `\`default_set_at\` datetime(6) NULL`,
    );

    await queryRunner.query(`
      UPDATE \`transaction_wallets\`
      SET \`is_default_user_deposit\` = 0, \`default_set_at\` = NULL
    `);

    await queryRunner.query(`
      INSERT INTO \`transaction_wallets\` (
        \`wallet_id\`,
        \`chain\`,
        \`address\`,
        \`purpose\`,
        \`encrypted_private_key\`,
        \`label\`,
        \`is_active\`,
        \`is_default_user_deposit\`,
        \`default_set_at\`,
        \`created_at\`,
        \`updated_at\`
      )
      SELECT
        UUID(),
        mw.\`chain\`,
        mw.\`address\`,
        'DEPOSIT',
        mw.\`encrypted_private_key\`,
        mw.\`label\`,
        mw.\`is_active\`,
        0,
        NULL,
        mw.\`created_at\`,
        mw.\`updated_at\`
      FROM \`managed_wallets\` mw
      WHERE NOT EXISTS (
        SELECT 1 FROM \`transaction_wallets\` tw
        WHERE tw.\`chain\` = mw.\`chain\` AND tw.\`address\` = mw.\`address\`
      )
    `);

    await queryRunner.query(`
      UPDATE \`transaction_wallets\` tw
      INNER JOIN \`managed_wallets\` mw
        ON tw.\`chain\` = mw.\`chain\` AND tw.\`address\` = mw.\`address\`
      SET
        tw.\`is_default_user_deposit\` = 1,
        tw.\`default_set_at\` = COALESCE(mw.\`default_set_at\`, mw.\`updated_at\`)
      WHERE mw.\`is_default_deposit\` = 1 AND mw.\`is_active\` = 1
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE `transaction_wallets` DROP COLUMN `default_set_at`');
    await queryRunner.query(
      'ALTER TABLE `transaction_wallets` DROP COLUMN `is_default_user_deposit`',
    );
  }
}
