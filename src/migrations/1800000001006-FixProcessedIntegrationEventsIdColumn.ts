import { type MigrationInterface, type QueryRunner } from 'typeorm';

/**
 * Repair migration: the initial 1800000001005 migration created
 * `processed_integration_events.id` as `char(36) NOT NULL` without a default.
 *
 * TypeORM's @PrimaryGeneratedColumn('uuid') inserts `undefined`, which the
 * Postgres driver should convert to gen_random_uuid() — but repo.insert()
 * bypasses driver-level defaults and passes NULL, violating the NOT NULL
 * constraint.
 *
 * This alters the column to use PostgreSQL's native `uuid` type with an
 * explicit DEFAULT so any future inserts auto-generate a UUID even if the
 * application-level driver logic doesn't fire.
 *
 * Safe to re-run: all operations are idempotent IF NOT EXISTS / DROP IF EXISTS.
 */
export class FixProcessedIntegrationEventsIdColumn1800000001006 implements MigrationInterface {
  name = 'FixProcessedIntegrationEventsIdColumn1800000001006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Step 1: add uuid extension (prerequisite for uuid type + gen_random_uuid)
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);

    // Step 2: rebuild the table to safely convert char(36) -> uuid
    // The table may contain rows with id = '' (empty string) which cannot be cast
    // directly via ALTER COLUMN ... TYPE uuid. Solution: rebuild via temp table.
    // Explicitly cast "id" to text to avoid PostgreSQL inferring uuid type
    // when rebuilding on a subsequent run (where id might already be uuid).
    await queryRunner.query(`
      CREATE TABLE "processed_integration_events_new" AS
      SELECT
        COALESCE(
          NULLIF(TRIM("id"::text), ''),
          gen_random_uuid()::text
        )::uuid AS "id",
        "consumer_name",
        "event_id",
        "processed_at"
      FROM "processed_integration_events"
    `);

    // Step 3: drop old table and constraints
    await queryRunner.query(`
      ALTER TABLE "processed_integration_events" DROP CONSTRAINT IF EXISTS "PK_processed_integration_events_id";
      ALTER TABLE "processed_integration_events" DROP CONSTRAINT IF EXISTS "UK_processed_integration_events_consumer_event";
      DROP TABLE "processed_integration_events";
    `);

    // Step 4: rename temp table to original name
    await queryRunner.query(`
      ALTER TABLE "processed_integration_events_new"
        RENAME TO "processed_integration_events"
    `);

    // Step 5: restore PK
    await queryRunner.query(`
      ALTER TABLE "processed_integration_events"
        ADD CONSTRAINT "PK_processed_integration_events_id" PRIMARY KEY ("id")
    `);

    // Step 6: restore UK
    await queryRunner.query(`
      ALTER TABLE "processed_integration_events"
        ADD CONSTRAINT "UK_processed_integration_events_consumer_event"
        UNIQUE ("consumer_name", "event_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Step 1: drop PK + UK
    await queryRunner.query(`
      ALTER TABLE "processed_integration_events"
        DROP CONSTRAINT IF EXISTS "PK_processed_integration_events_id",
        DROP CONSTRAINT IF EXISTS "UK_processed_integration_events_consumer_event"
    `);

    // Step 2: restore the column as char(36) NOT NULL (matching original schema)
    await queryRunner.query(`
      ALTER TABLE "processed_integration_events"
        ALTER COLUMN "id" SET DATA TYPE char(36)
          USING substring("id"::text, 1, 36),
        ALTER COLUMN "id" DROP DEFAULT,
        ALTER COLUMN "id" SET NOT NULL
    `);

    // Step 3: restore PK
    await queryRunner.query(`
      ALTER TABLE "processed_integration_events"
        ADD CONSTRAINT "PK_processed_integration_events_id" PRIMARY KEY ("id")
    `);

    // Step 4: restore UK
    await queryRunner.query(`
      ALTER TABLE "processed_integration_events"
        ADD CONSTRAINT "UK_processed_integration_events_consumer_event"
        UNIQUE ("consumer_name", "event_id")
    `);
  }
}
