import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOpsCategoryToSystemConfigs1700000000003 implements MigrationInterface {
  name = 'AddOpsCategoryToSystemConfigs1700000000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'system_configs_category_enum') THEN
          CREATE TYPE "public"."system_configs_category_enum" AS ENUM('tech', 'finance', 'core', 'ops');
        ELSE
          ALTER TYPE "public"."system_configs_category_enum" ADD VALUE IF NOT EXISTS 'ops';
        END IF;
      END$$;
    `);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL does not support removing enum values easily.
    // Reverting would require recreating the enum type.
  }
}
