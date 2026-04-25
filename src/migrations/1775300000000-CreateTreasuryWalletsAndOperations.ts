import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTreasuryWalletsAndOperations1775300000000 implements MigrationInterface {
  private isPostgres(queryRunner: QueryRunner): boolean {
    return queryRunner.connection.options.type === 'postgres';
  }

  name = 'CreateTreasuryWalletsAndOperations1775300000000';

  private async addForeignKeyIfNotExists(queryRunner: QueryRunner, sql: string): Promise<void> {
    const m = sql.match(/ADD CONSTRAINT `([^`]+)`/);
    if (!m) {
      await queryRunner.query(sql);
      return;
    }
    const constraintName = m[1];
    const dbRows: { db: string | null }[] = await queryRunner.query(`SELECT DATABASE() AS db`);
    const schema = dbRows[0]?.db;
    if (!schema) {
      await queryRunner.query(sql);
      return;
    }
    const tableMatch = sql.match(/ALTER TABLE `([^`]+)`/);
    const fkColMatch = sql.match(/FOREIGN KEY \(`([^`]+)`\)/);
    if (tableMatch && fkColMatch) {
      const colRows: unknown[] = await queryRunner.query(
        `SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
        [schema, tableMatch[1], fkColMatch[1]],
      );
      if (colRows.length === 0) {
        return;
      }
    }
    const existing: unknown[] = await queryRunner.query(
      `SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = ? AND CONSTRAINT_NAME = ? LIMIT 1`,
      [schema, constraintName],
    );
    if (existing.length > 0) {
      return;
    }
    try {
      await queryRunner.query(sql);
    } catch (e: unknown) {
      const err = e as {
        code?: string;
        errno?: number;
        driverError?: { code?: string; errno?: number };
      };
      const errno = err.driverError?.errno ?? err.errno;
      const code = err.driverError?.code ?? err.code;
      if (
        errno === 3780 ||
        errno === 1826 ||
        code === 'ER_FK_INCOMPATIBLE_COLUMNS' ||
        code === 'ER_FK_DUP_NAME'
      ) {
        return;
      }
      throw e;
    }
  }

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

  private async addIndexIfNotExists(
    queryRunner: QueryRunner,
    tableName: string,
    indexName: string,
    addIndexClause: string,
  ): Promise<void> {
    const dbRows: { db: string | null }[] = await queryRunner.query(`SELECT DATABASE() AS db`);
    const schema = dbRows[0]?.db;
    if (!schema) return;
    const rows: unknown[] = await queryRunner.query(
      `SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1`,
      [schema, tableName, indexName],
    );
    if (rows.length === 0) {
      await queryRunner.query(`ALTER TABLE \`${tableName}\` ${addIndexClause}`);
    }
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (this.isPostgres(queryRunner)) {
      return;
    }
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`transaction_wallets\` (
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
      CREATE TABLE IF NOT EXISTS \`treasury_operations\` (
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

    await this.addForeignKeyIfNotExists(
      queryRunner,
      `ALTER TABLE \`treasury_operations\`
      ADD CONSTRAINT \`FK_treasury_op_actor_user\` FOREIGN KEY (\`actor_user_id\`) REFERENCES \`users\`(\`user_id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    await this.addForeignKeyIfNotExists(
      queryRunner,
      `ALTER TABLE \`treasury_operations\`
      ADD CONSTRAINT \`FK_treasury_op_from_wallet\` FOREIGN KEY (\`from_wallet_id\`) REFERENCES \`transaction_wallets\`(\`wallet_id\`) ON DELETE SET NULL ON UPDATE NO ACTION`,
    );

    await this.addForeignKeyIfNotExists(
      queryRunner,
      `ALTER TABLE \`treasury_operations\`
      ADD CONSTRAINT \`FK_treasury_op_to_wallet\` FOREIGN KEY (\`to_wallet_id\`) REFERENCES \`transaction_wallets\`(\`wallet_id\`) ON DELETE SET NULL ON UPDATE NO ACTION`,
    );

    await queryRunner.query(`
      ALTER TABLE \`onchain_transactions\`
      MODIFY COLUMN \`type\` enum ('DEPOSIT', 'WITHDRAWAL', 'TRANSFER', 'SWEEP', 'FUND') NOT NULL
    `);

    await this.addColumnIfNotExists(
      queryRunner,
      'onchain_transactions',
      'treasury_operation_id',
      `\`treasury_operation_id\` char(36) NULL AFTER \`linked_wallet_id\``,
    );

    await this.addIndexIfNotExists(
      queryRunner,
      'onchain_transactions',
      'idx_onchain_tx_treasury_operation',
      `ADD INDEX \`idx_onchain_tx_treasury_operation\` (\`treasury_operation_id\`)`,
    );

    await this.addForeignKeyIfNotExists(
      queryRunner,
      `ALTER TABLE \`onchain_transactions\`
      ADD CONSTRAINT \`FK_onchain_tx_treasury_operation\` FOREIGN KEY (\`treasury_operation_id\`) REFERENCES \`treasury_operations\`(\`operation_id\`) ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (this.isPostgres(queryRunner)) {
      return;
    }
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
