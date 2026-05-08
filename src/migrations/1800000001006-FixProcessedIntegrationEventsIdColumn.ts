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

    // Step 2: drop the broken PK + UK (they reference the column being altered)
    await queryRunner.query(`
      ALTER TABLE "processed_integration_events"
        DROP CONSTRAINT IF EXISTS "PK_processed_integration_events_id",
        DROP CONSTRAINT IF EXISTS "UK_processed_integration_events_consumer_event"
    `);

    // Step 3: recreate the column with uuid type + gen_random_uuid default
    await queryRunner.query(`
      ALTER TABLE "processed_integration_events"
        ALTER COLUMN "id" SET DATA TYPE uuid
          USING NULLIF("id", '')::uuid,
        ALTER COLUMN "id" SET DEFAULT gen_random_uuid(),
        ALTER COLUMN "id" SET NOT NULL
    `);

    // Step 4: restore the PK (PostgreSQL auto-creates a btree index)
    await queryRunner.query(`
      ALTER TABLE "processed_integration_events"
        ADD CONSTRAINT "PK_processed_integration_events_id" PRIMARY KEY ("id")
    `);

    // Step 5: restore the UK
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
