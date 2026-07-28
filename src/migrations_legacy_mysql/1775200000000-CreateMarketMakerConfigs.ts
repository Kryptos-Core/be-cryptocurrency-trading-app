import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * LEGACY MySQL migration — DO NOT USE FOR POSTGRES.
 *
 * This file lives under `src/migrations_legacy_mysql/` and is intentionally
 * NOT loaded by the active Postgres DataSource (see `src/config/data-source.ts`).
 *
 * It only ran during the project's MySQL era. On Postgres it returns early
 * without creating any table, which is why the `market_maker_configs` table
 * was missing after the MySQL → Postgres migration.
 *
 * The Postgres replacement lives at:
 *   src/migrations/1800000001016-CreateMarketMakerConfigsPostgres.ts
 *
 * Rules:
 *  - DO NOT add new Postgres-compatible logic here — it will never run.
 *  - DO NOT remove this file without coordinating with the MySQL rollback plan
 *    (legacy environments may still depend on it via explicit `--migration` runs).
 *  - For any new schema work, create a migration under `src/migrations/`.
 */
export class CreateMarketMakerConfigs1775200000000 implements MigrationInterface {
  private isPostgres(queryRunner: QueryRunner): boolean {
    return queryRunner.connection.options.type === 'postgres';
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (this.isPostgres(queryRunner)) {
      return;
    }
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS market_maker_configs (
        config_id                       CHAR(36)        NOT NULL,
        user_id                         CHAR(36)        NOT NULL,
        pair_id                         CHAR(36)        NOT NULL,
        spread_bps                      INT UNSIGNED    NOT NULL,
        spread_alert_threshold_bps      INT UNSIGNED    NOT NULL DEFAULT 0,
        order_amount                    DECIMAL(36,18)  NOT NULL,
        is_active                       TINYINT(1)      NOT NULL DEFAULT 1,
        stop_loss_pct                   DECIMAL(10,4)   NULL,
        max_position_base               DECIMAL(36,18)  NULL,
        created_at                      DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at                      DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (config_id),
        UNIQUE KEY uk_mm_cfg_user_pair (user_id, pair_id),
        KEY idx_mm_cfg_active (is_active),
        CONSTRAINT fk_mm_cfg_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
        CONSTRAINT fk_mm_cfg_pair FOREIGN KEY (pair_id) REFERENCES market_pairs(pair_id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (this.isPostgres(queryRunner)) {
      return;
    }
    await queryRunner.query('DROP TABLE IF EXISTS market_maker_configs');
  }
}
