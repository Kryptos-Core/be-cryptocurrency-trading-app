import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateMarketMakerConfigs1775200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
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
    await queryRunner.query('DROP TABLE IF EXISTS market_maker_configs');
  }
}
