import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class CreateDepositWatcherCursors1800000001011 implements MigrationInterface {
  name = 'CreateDepositWatcherCursors1800000001011';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "deposit_watcher_cursors" (
        "chain"         varchar(64)      NOT NULL,
        "cursor_value"  bigint           NOT NULL DEFAULT 0,
        "cursor_kind"   varchar(32)      NOT NULL DEFAULT 'TIMESTAMP_MS',
        "updated_at"    TIMESTAMP(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        CONSTRAINT "PK_deposit_watcher_cursors_chain" PRIMARY KEY ("chain"),
        CONSTRAINT "CK_deposit_watcher_cursors_cursor_kind" 
          CHECK ("cursor_kind" IN ('TIMESTAMP_MS', 'BLOCK_NUMBER'))
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_deposit_watcher_cursors_updated_at"
      ON "deposit_watcher_cursors" ("updated_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "deposit_watcher_cursors"`);
  }
}
