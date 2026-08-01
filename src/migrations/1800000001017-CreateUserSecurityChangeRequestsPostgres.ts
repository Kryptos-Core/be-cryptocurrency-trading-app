import { type MigrationInterface, type QueryRunner } from 'typeorm';

/**
 * Create user_security_change_requests table on Postgres.
 *
 * History: the original schema for this table lived in
 * `src/migrations_legacy_mysql/1774400000000-AddUserProfileSecurityAvatar.ts`
 * but that migration short-circuits on Postgres (it was authored for the
 * legacy MySQL stack). The Postgres baseline never created this table, so
 * Risk Officer flows (review pending security change requests) crash with
 *   `relation "user_security_change_requests" does not exist`.
 *
 * This migration fills the gap: same columns / indexes / FK semantics as the
 * MySQL version, adapted for Postgres (ENUM type, jsonb, IF NOT EXISTS).
 */
export class CreateUserSecurityChangeRequestsPostgres1800000001017
  implements MigrationInterface
{
  name = 'CreateUserSecurityChangeRequestsPostgres1800000001017';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "public"."user_security_change_requests_status_enum"
      AS ENUM ('PENDING', 'APPROVED', 'REJECTED')
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS user_security_change_requests (
        request_id      CHAR(36)                                                  NOT NULL,
        user_id         CHAR(36)                                                  NOT NULL,
        change_type     VARCHAR(50)                                               NOT NULL,
        payload_json    JSONB                                                     NOT NULL,
        status          "public"."user_security_change_requests_status_enum"      NOT NULL DEFAULT 'PENDING',
        requested_at    TIMESTAMP(6)                                              NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        reviewed_at     TIMESTAMP(6)                                              NULL,
        reviewed_by     CHAR(36)                                                  NULL,
        review_note     VARCHAR(500)                                              NULL,
        created_at      TIMESTAMP(6)                                              NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        CONSTRAINT pk_user_security_change_requests PRIMARY KEY (request_id),
        CONSTRAINT fk_user_security_change_requests_user
          FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_user_security_requests_user
      ON user_security_change_requests (user_id)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_user_security_requests_status
      ON user_security_change_requests (status)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_user_security_requests_requested_at
      ON user_security_change_requests (requested_at)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_user_security_requests_requested_at`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_user_security_requests_status`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_user_security_requests_user`);
    await queryRunner.query(`DROP TABLE IF EXISTS user_security_change_requests`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."user_security_change_requests_status_enum"`,
    );
  }
}
