import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class ExpandDedupeKeyLength1800000001003 implements MigrationInterface {
  name = 'ExpandDedupeKeyLength1800000001003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'integration_outbox'
        ) THEN
          ALTER TABLE "integration_outbox"
            ALTER COLUMN "dedupe_key" TYPE VARCHAR(191);
        END IF;
      END$$;
    `);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Intentionally left blank — no down migration for schema expansion.
  }
}
