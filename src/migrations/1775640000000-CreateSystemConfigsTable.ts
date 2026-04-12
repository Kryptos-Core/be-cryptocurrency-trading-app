import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Runtime key/value settings (RPC URLs, intervals, finance limits, etc.).
 * Seeded at app startup via SystemConfigService when rows are missing.
 */
export class CreateSystemConfigsTable1775640000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`system_configs\` (
        \`key\`           VARCHAR(100)   NOT NULL,
        \`value\`         TEXT           NOT NULL,
        \`type\`          ENUM('string','int','float','bool') NOT NULL DEFAULT 'string',
        \`category\`      ENUM('tech','finance','core') NOT NULL DEFAULT 'core',
        \`name\`          VARCHAR(255)   NOT NULL,
        \`description\`   TEXT           NULL,
        \`isReadOnly\`    TINYINT(1)     NOT NULL DEFAULT 0,
        \`created_at\`    DATETIME(6)    NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\`    DATETIME(6)    NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`key\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS `system_configs`');
  }
}
