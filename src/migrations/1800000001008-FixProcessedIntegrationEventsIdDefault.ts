import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class FixProcessedIntegrationEventsIdDefault1800000001008 implements MigrationInterface {
  name = 'FixProcessedIntegrationEventsIdDefault1800000001008';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // The id column exists but lacks DEFAULT — add it back so inserts succeed.
    // The column type remains whatever 1006 left it as (uuid/char(36)).
    await queryRunner.query(`
      ALTER TABLE "processed_integration_events"
      ALTER COLUMN "id" SET DEFAULT gen_random_uuid()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "processed_integration_events"
      ALTER COLUMN "id" DROP DEFAULT
    `);
  }
}
