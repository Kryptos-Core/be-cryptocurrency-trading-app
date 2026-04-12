import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Recreate currency stored procedures for UUID v7 schema.
 * All ID parameters use CHAR(36). Run after 1768227800000-RecreateUsersAndWalletsProceduresUuidV7.
 */
export class RecreateCurrenciesProceduresUuidV71768227900000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_currency_find_by_id');
    await queryRunner.query(`
      CREATE PROCEDURE sp_currency_find_by_id(IN p_currency_id CHAR(36))
      BEGIN
        SELECT currency_id, symbol, name, precision_scale, min_withdraw, is_tradable, is_active
        FROM currencies WHERE currency_id = p_currency_id LIMIT 1;
      END
    `);

    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_currency_find_by_symbol');
    await queryRunner.query(`
      CREATE PROCEDURE sp_currency_find_by_symbol(IN p_symbol VARCHAR(16))
      BEGIN
        SELECT currency_id, symbol, name, precision_scale, min_withdraw, is_tradable, is_active
        FROM currencies WHERE symbol = UPPER(p_symbol) LIMIT 1;
      END
    `);

    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_currency_find_all');
    await queryRunner.query(`
      CREATE PROCEDURE sp_currency_find_all(IN p_skip INT, IN p_limit INT, IN p_include_inactive BOOLEAN)
      BEGIN
        IF p_include_inactive THEN
          SELECT currency_id, symbol, name, precision_scale, min_withdraw, is_tradable, is_active
          FROM currencies ORDER BY symbol ASC LIMIT p_skip, p_limit;
        ELSE
          SELECT currency_id, symbol, name, precision_scale, min_withdraw, is_tradable, is_active
          FROM currencies WHERE is_active = 1 ORDER BY symbol ASC LIMIT p_skip, p_limit;
        END IF;
      END
    `);

    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_currency_count');
    await queryRunner.query(`
      CREATE PROCEDURE sp_currency_count(IN p_include_inactive BOOLEAN, OUT p_total INT)
      BEGIN
        IF p_include_inactive THEN
          SELECT COUNT(*) INTO p_total FROM currencies;
        ELSE
          SELECT COUNT(*) INTO p_total FROM currencies WHERE is_active = 1;
        END IF;
      END
    `);

    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_currency_create');
    await queryRunner.query(`
      CREATE PROCEDURE sp_currency_create(
        IN p_currency_id CHAR(36),
        IN p_symbol VARCHAR(16),
        IN p_name VARCHAR(64),
        IN p_precision_scale TINYINT,
        IN p_min_withdraw DECIMAL(36, 18),
        IN p_is_tradable TINYINT,
        IN p_is_active TINYINT
      )
      BEGIN
        DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
        IF EXISTS (SELECT 1 FROM currencies WHERE symbol = UPPER(p_symbol)) THEN
          SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Currency symbol already exists';
        END IF;
        START TRANSACTION;
        INSERT INTO currencies (currency_id, symbol, name, precision_scale, min_withdraw, is_tradable, is_active)
        VALUES (p_currency_id, UPPER(p_symbol), p_name, IFNULL(p_precision_scale, 8), IFNULL(p_min_withdraw, 0), IFNULL(p_is_tradable, 1), IFNULL(p_is_active, 1));
        COMMIT;
      END
    `);

    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_currency_update');
    await queryRunner.query(`
      CREATE PROCEDURE sp_currency_update(
        IN p_currency_id CHAR(36),
        IN p_symbol VARCHAR(16),
        IN p_name VARCHAR(64),
        IN p_precision_scale TINYINT,
        IN p_min_withdraw DECIMAL(36, 18),
        IN p_is_tradable TINYINT,
        IN p_is_active TINYINT
      )
      BEGIN
        DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
        IF NOT EXISTS (SELECT 1 FROM currencies WHERE currency_id = p_currency_id) THEN
          SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Currency not found';
        END IF;
        IF p_symbol IS NOT NULL AND p_symbol != '' AND EXISTS (SELECT 1 FROM currencies WHERE symbol = UPPER(p_symbol) AND currency_id != p_currency_id) THEN
          SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Currency symbol already exists';
        END IF;
        START TRANSACTION;
        UPDATE currencies SET
          symbol = IFNULL(UPPER(p_symbol), symbol),
          name = IFNULL(p_name, name),
          precision_scale = IFNULL(p_precision_scale, precision_scale),
          min_withdraw = IFNULL(p_min_withdraw, min_withdraw),
          is_tradable = IFNULL(p_is_tradable, is_tradable),
          is_active = IFNULL(p_is_active, is_active)
        WHERE currency_id = p_currency_id;
        COMMIT;
      END
    `);

    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_currency_delete');
    await queryRunner.query(`
      CREATE PROCEDURE sp_currency_delete(IN p_currency_id CHAR(36))
      BEGIN
        DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
        IF NOT EXISTS (SELECT 1 FROM currencies WHERE currency_id = p_currency_id) THEN
          SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Currency not found';
        END IF;
        START TRANSACTION;
        UPDATE currencies SET is_active = 0 WHERE currency_id = p_currency_id;
        COMMIT;
      END
    `);

    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_currency_symbol_exists');
    await queryRunner.query(`
      CREATE PROCEDURE sp_currency_symbol_exists(
        IN p_symbol VARCHAR(16),
        IN p_exclude_currency_id CHAR(36),
        OUT p_exists BOOLEAN
      )
      BEGIN
        IF p_exclude_currency_id IS NOT NULL AND p_exclude_currency_id != '' THEN
          SELECT EXISTS(SELECT 1 FROM currencies WHERE symbol = UPPER(p_symbol) AND currency_id != p_exclude_currency_id) INTO p_exists;
        ELSE
          SELECT EXISTS(SELECT 1 FROM currencies WHERE symbol = UPPER(p_symbol)) INTO p_exists;
        END IF;
      END
    `);

    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_currency_find_active');
    await queryRunner.query(`
      CREATE PROCEDURE sp_currency_find_active()
      BEGIN
        SELECT currency_id, symbol, name, precision_scale, min_withdraw, is_tradable, is_active
        FROM currencies WHERE is_active = 1 ORDER BY symbol ASC;
      END
    `);

    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_currency_find_tradable');
    await queryRunner.query(`
      CREATE PROCEDURE sp_currency_find_tradable()
      BEGIN
        SELECT currency_id, symbol, name, precision_scale, min_withdraw, is_tradable, is_active
        FROM currencies WHERE is_tradable = 1 AND is_active = 1 ORDER BY symbol ASC;
      END
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const procedures = [
      'sp_currency_find_tradable',
      'sp_currency_find_active',
      'sp_currency_symbol_exists',
      'sp_currency_delete',
      'sp_currency_update',
      'sp_currency_create',
      'sp_currency_count',
      'sp_currency_find_all',
      'sp_currency_find_by_symbol',
      'sp_currency_find_by_id',
    ];
    for (const name of procedures) {
      await queryRunner.query(`DROP PROCEDURE IF EXISTS \`${name}\``);
    }
  }
}
