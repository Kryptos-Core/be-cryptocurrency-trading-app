import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Create Payment Method Configs
 *
 * Creates:
 * - payment_method_configs table: encrypted dynamic payment gateway configs
 *   replacing hard-coded .env values for PayOS and blockchain hot wallets.
 * - sp_payment_config_find_active: fetch ACTIVE config by type+network
 * - sp_payment_config_list: list all configs
 * - sp_payment_config_upsert: insert or update a config record
 * - sp_payment_config_set_status: transition status + set timestamps
 */
export class CreatePaymentMethodConfigs1775000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── payment_method_configs ────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS payment_method_configs (
        config_id             CHAR(36)        NOT NULL,
        type                  ENUM('PAYOS','ETH','TRON','SOL') NOT NULL,
        network               VARCHAR(64)     NOT NULL,
        display_name          VARCHAR(128)    NOT NULL,
        encrypted_config      TEXT            NOT NULL,
        config_version        INT UNSIGNED    NOT NULL DEFAULT 1,
        status                ENUM('ACTIVE','TRANSITIONING','INACTIVE') NOT NULL DEFAULT 'INACTIVE',
        grace_period_minutes  INT UNSIGNED    NOT NULL DEFAULT 15,
        transition_started_at DATETIME        NULL,
        activated_at          DATETIME        NULL,
        sort_order            INT             NOT NULL DEFAULT 0,
        created_by            CHAR(36)        NOT NULL,
        updated_by            CHAR(36)        NOT NULL,
        created_at            DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at            DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (config_id),
        INDEX idx_pmc_type_network_status (type, network, status),
        INDEX idx_pmc_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // ── sp_payment_config_find_active ─────────────────────────────────────────
    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_payment_config_find_active');
    await queryRunner.query(`
      CREATE PROCEDURE sp_payment_config_find_active(
        IN p_type    VARCHAR(10),
        IN p_network VARCHAR(64)
      )
      READS SQL DATA
      BEGIN
        SELECT *
        FROM payment_method_configs
        WHERE type    = p_type
          AND network = p_network
          AND status  = 'ACTIVE'
        ORDER BY sort_order ASC, activated_at DESC
        LIMIT 1;
      END
    `);

    // ── sp_payment_config_list ────────────────────────────────────────────────
    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_payment_config_list');
    await queryRunner.query(`
      CREATE PROCEDURE sp_payment_config_list()
      READS SQL DATA
      BEGIN
        SELECT
          config_id, type, network, display_name,
          config_version, status, grace_period_minutes,
          transition_started_at, activated_at,
          sort_order, created_by, updated_by, created_at, updated_at
        FROM payment_method_configs
        ORDER BY type, network, sort_order, created_at DESC;
      END
    `);

    // ── sp_payment_config_upsert ──────────────────────────────────────────────
    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_payment_config_upsert');
    await queryRunner.query(`
      CREATE PROCEDURE sp_payment_config_upsert(
        IN p_config_id           CHAR(36),
        IN p_type                VARCHAR(10),
        IN p_network             VARCHAR(64),
        IN p_display_name        VARCHAR(128),
        IN p_encrypted_config    TEXT,
        IN p_grace_period_minutes INT,
        IN p_sort_order          INT,
        IN p_user_id             CHAR(36)
      )
      MODIFIES SQL DATA
      BEGIN
        INSERT INTO payment_method_configs
          (config_id, type, network, display_name, encrypted_config,
           grace_period_minutes, sort_order, created_by, updated_by)
        VALUES
          (p_config_id, p_type, p_network, p_display_name, p_encrypted_config,
           p_grace_period_minutes, p_sort_order, p_user_id, p_user_id)
        ON DUPLICATE KEY UPDATE
          display_name          = p_display_name,
          encrypted_config      = p_encrypted_config,
          config_version        = config_version + 1,
          grace_period_minutes  = p_grace_period_minutes,
          sort_order            = p_sort_order,
          updated_by            = p_user_id;

        SELECT * FROM payment_method_configs WHERE config_id = p_config_id LIMIT 1;
      END
    `);

    // ── sp_payment_config_set_status ──────────────────────────────────────────
    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_payment_config_set_status');
    await queryRunner.query(`
      CREATE PROCEDURE sp_payment_config_set_status(
        IN p_config_id CHAR(36),
        IN p_status    VARCHAR(16),
        IN p_user_id   CHAR(36)
      )
      MODIFIES SQL DATA
      BEGIN
        UPDATE payment_method_configs
        SET
          status                = p_status,
          transition_started_at = CASE WHEN p_status = 'TRANSITIONING' THEN NOW() ELSE transition_started_at END,
          activated_at          = CASE WHEN p_status = 'ACTIVE'        THEN NOW() ELSE activated_at          END,
          config_version        = config_version + 1,
          updated_by            = p_user_id
        WHERE config_id = p_config_id;

        SELECT * FROM payment_method_configs WHERE config_id = p_config_id LIMIT 1;
      END
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_payment_config_set_status');
    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_payment_config_upsert');
    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_payment_config_list');
    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_payment_config_find_active');
    await queryRunner.query('DROP TABLE IF EXISTS payment_method_configs');
  }
}
