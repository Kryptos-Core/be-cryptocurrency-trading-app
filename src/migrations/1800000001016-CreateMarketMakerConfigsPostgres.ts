import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class CreateMarketMakerConfigsPostgres1800000001016
  implements MigrationInterface
{
  name = 'CreateMarketMakerConfigsPostgres1800000001016';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS market_maker_configs (
        config_id                      CHAR(36)        NOT NULL,
        user_id                        CHAR(36)        NOT NULL,
        pair_id                        CHAR(36)        NOT NULL,
        spread_bps                     INTEGER         NOT NULL CHECK (spread_bps >= 0),
        spread_alert_threshold_bps     INTEGER         NOT NULL DEFAULT 0 CHECK (spread_alert_threshold_bps >= 0),
        order_amount                   NUMERIC(36,18)  NOT NULL,
        is_active                      BOOLEAN         NOT NULL DEFAULT TRUE,
        stop_loss_pct                  NUMERIC(10,4)   NULL,
        max_position_base              NUMERIC(36,18)  NULL,
        created_at                     TIMESTAMP       NOT NULL DEFAULT NOW(),
        updated_at                     TIMESTAMP       NOT NULL DEFAULT NOW(),
        CONSTRAINT pk_market_maker_configs PRIMARY KEY (config_id),
        CONSTRAINT fk_mm_cfg_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
        CONSTRAINT fk_mm_cfg_pair FOREIGN KEY (pair_id) REFERENCES market_pairs(pair_id) ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uk_mm_cfg_user_pair
      ON market_maker_configs (user_id, pair_id)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_mm_cfg_active
      ON market_maker_configs (is_active)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_mm_cfg_active`);
    await queryRunner.query(`DROP INDEX IF EXISTS uk_mm_cfg_user_pair`);
    await queryRunner.query(`DROP TABLE IF EXISTS market_maker_configs`);
  }
}