import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFinanceManagerRoleToUsers1775100000000 implements MigrationInterface {
  private isPostgres(queryRunner: QueryRunner): boolean {
    return queryRunner.connection.options.type === 'postgres';
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (this.isPostgres(queryRunner)) {
      return;
    }
    const tableExists = await queryRunner.hasTable('users');
    if (!tableExists) return;

    const table = await queryRunner.getTable('users');
    const roleColumn = table?.findColumnByName('role');
    if (!roleColumn) return;

    await queryRunner.query(`
      ALTER TABLE users
      MODIFY COLUMN role ENUM(
        'GUEST',
        'TRADER',
        'VERIFIED_USER',
        'ADMIN',
        'RISK_OFFICER',
        'SUPPORT_AGENT',
        'MARKET_MAKER',
        'FINANCE_MANAGER'
      ) NOT NULL DEFAULT 'TRADER'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (this.isPostgres(queryRunner)) {
      return;
    }
    const tableExists = await queryRunner.hasTable('users');
    if (!tableExists) return;

    const table = await queryRunner.getTable('users');
    const roleColumn = table?.findColumnByName('role');
    if (!roleColumn) return;

    await queryRunner.query(`
      ALTER TABLE users
      MODIFY COLUMN role ENUM(
        'GUEST',
        'TRADER',
        'VERIFIED_USER',
        'ADMIN',
        'RISK_OFFICER',
        'SUPPORT_AGENT',
        'MARKET_MAKER'
      ) NOT NULL DEFAULT 'TRADER'
    `);
  }
}
