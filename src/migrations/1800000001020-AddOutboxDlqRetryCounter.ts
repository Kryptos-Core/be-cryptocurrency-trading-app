import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class AddOutboxDlqRetryCounter1800000001020 implements MigrationInterface {
  name = 'AddOutboxDlqRetryCounter1800000001020';

  public async up(queryRunner: QueryRunner): Promise<void> {
    /**
     * Tracks how many times a row has been reset from dead-letter back into the
     * normal relay queue. Combined with `EVENT_OUTBOX_DLQ_MAX_RETRIES` this gives
     * us a bounded DLQ retry loop so a poisoned message cannot churn forever.
     */
    await queryRunner.query(`
      ALTER TABLE "integration_outbox"
      ADD COLUMN "dlq_retry_count" integer NOT NULL DEFAULT 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "integration_outbox"
      DROP COLUMN "dlq_retry_count"
    `);
  }
}
