import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOpsCategoryToSystemConfigs1700000000003 implements MigrationInterface {
  name = 'AddOpsCategoryToSystemConfigs1700000000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE system_configs_category_enum
      ADD VALUE IF NOT EXISTS 'ops';
    `);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL does not support removing enum values easily.
    // Reverting would require recreating the enum type.
  }
}
