import { type MigrationInterface, type QueryRunner } from 'typeorm';

/**
 * Create `admin_wallet_adjustments` table on Postgres.
 *
 * History: the original schema for this table lived in
 * `src/migrations_legacy_mysql/1774900000000-CreateAdminWalletAdjustments.ts`
 * but that migration short-circuits on Postgres (`if (this.isPostgres(...)) return;`).
 * The Postgres baseline never created this table, so the admin adjustments
 *   GET /api/v1/wallets/admin/adjustments/:targetUserId
 *   POST /api/v1/wallets/admin/adjust
 *   - 500: relation "admin_wallet_adjustments" does not exist
 *
 * This migration fills the gap: same columns / indexes / FK semantics as the
 * MySQL version, adapted for Postgres (custom ENUM type, NUMERIC, IF NOT EXISTS,
 * TIMESTAMP(6) precision). The stored-procedure wrappers (`sp_admin_wallet_adjustment_*`)
 * from MySQL are not recreated here because `AdminWalletAdjustmentRepositoryImpl`
 * already runs parameterized SQL directly (Postgres-style `$1, $2, ...`) instead of
 * calling stored procedures.
 */
export class CreateAdminWalletAdjustmentsPostgres1800000001018
  implements MigrationInterface
{
  name = 'CreateAdminWalletAdjustmentsPostgres1800000001018';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "public"."admin_wallet_adjustments_type_enum"
      AS ENUM ('DEPOSIT', 'WITHDRAW')
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS admin_wallet_adjustments (
        adjustment_id   CHAR(36)                                                NOT NULL,
        actor_user_id   CHAR(36)                                                NOT NULL,
        target_user_id  CHAR(36)                                                NOT NULL,
        currency_id     CHAR(36)                                                NOT NULL,
        amount          NUMERIC(36,18)                                          NOT NULL,
        type            "public"."admin_wallet_adjustments_type_enum"            NOT NULL,
        note            VARCHAR(500)                                            NULL,
        created_at      TIMESTAMP(6)                                            NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        CONSTRAINT pk_admin_wallet_adjustments PRIMARY KEY (adjustment_id),
        CONSTRAINT fk_adj_actor    FOREIGN KEY (actor_user_id)
          REFERENCES users(user_id) ON DELETE CASCADE,
        CONSTRAINT fk_adj_target   FOREIGN KEY (target_user_id)
          REFERENCES users(user_id) ON DELETE CASCADE,
        CONSTRAINT fk_adj_currency FOREIGN KEY (currency_id)
          REFERENCES currencies(currency_id) ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_adj_actor
        ON admin_wallet_adjustments (actor_user_id)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_adj_target
        ON admin_wallet_adjustments (target_user_id)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_adj_created
        ON admin_wallet_adjustments (created_at)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_adj_created`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_adj_target`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_adj_actor`);
    await queryRunner.query(`DROP TABLE IF EXISTS admin_wallet_adjustments`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."admin_wallet_adjustments_type_enum"`,
    );
  }
}