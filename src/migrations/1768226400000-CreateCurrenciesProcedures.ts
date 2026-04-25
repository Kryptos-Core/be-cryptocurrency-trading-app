import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Create legacy MySQL legacy MySQL legacy MySQL stored procedures for Currencies
 *
 * Legacy MySQL legacy MySQL legacy MySQL stored procedures được tạo để:
 * - Tăng security (SQL injection protection)
 * - Tăng performance (DB-level optimization)
 * - Tách biệt business logic từ database logic
 *
 * Design Pattern: Legacy database-procedure pattern
 */
export class CreateCurrenciesProcedures1768226400000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ============================================
    // PROCEDURE 1: sp_currency_find_by_id
    // Purpose: Find currency by ID
    // ============================================
    await queryRunner.query(`
      DROP PROCEDURE IF EXISTS sp_currency_find_by_id;
    `);

    await queryRunner.query(`
      CREATE PROCEDURE sp_currency_find_by_id(
        IN p_currency_id INT
      )
      BEGIN
        SELECT 
          currency_id,
          symbol,
          name,
          precision_scale,
          min_withdraw,
          is_tradable,
          is_active
        FROM currencies
        WHERE currency_id = p_currency_id
        LIMIT 1;
      END;
    `);

    // ============================================
    // PROCEDURE 2: sp_currency_find_by_symbol
    // Purpose: Find currency by symbol
    // ============================================
    await queryRunner.query(`
      DROP PROCEDURE IF EXISTS sp_currency_find_by_symbol;
    `);

    await queryRunner.query(`
      CREATE PROCEDURE sp_currency_find_by_symbol(
        IN p_symbol VARCHAR(16)
      )
      BEGIN
        SELECT 
          currency_id,
          symbol,
          name,
          precision_scale,
          min_withdraw,
          is_tradable,
          is_active
        FROM currencies
        WHERE symbol = UPPER(p_symbol)
        LIMIT 1;
      END;
    `);

    // ============================================
    // PROCEDURE 3: sp_currency_find_all
    // Purpose: Find all currencies with pagination
    // ============================================
    await queryRunner.query(`
      DROP PROCEDURE IF EXISTS sp_currency_find_all;
    `);

    await queryRunner.query(`
      CREATE PROCEDURE sp_currency_find_all(
        IN p_skip INT,
        IN p_limit INT,
        IN p_include_inactive BOOLEAN
      )
      BEGIN
        IF p_include_inactive THEN
          SELECT 
            currency_id,
            symbol,
            name,
            precision_scale,
            min_withdraw,
            is_tradable,
            is_active
          FROM currencies
          ORDER BY symbol ASC
          LIMIT p_skip, p_limit;
        ELSE
          SELECT 
            currency_id,
            symbol,
            name,
            precision_scale,
            min_withdraw,
            is_tradable,
            is_active
          FROM currencies
          WHERE is_active = TRUE
          ORDER BY symbol ASC
          LIMIT p_skip, p_limit;
        END IF;
      END;
    `);

    // ============================================
    // PROCEDURE 4: sp_currency_count
    // Purpose: Count total currencies
    // ============================================
    await queryRunner.query(`
      DROP PROCEDURE IF EXISTS sp_currency_count;
    `);

    await queryRunner.query(`
      CREATE PROCEDURE sp_currency_count(
        IN p_include_inactive BOOLEAN,
        OUT p_total INT
      )
      BEGIN
        IF p_include_inactive THEN
          SELECT COUNT(*) INTO p_total FROM currencies;
        ELSE
          SELECT COUNT(*) INTO p_total FROM currencies WHERE is_active = TRUE;
        END IF;
      END;
    `);

    // ============================================
    // PROCEDURE 5: sp_currency_create
    // Purpose: Create new currency
    // ============================================
    await queryRunner.query(`
      DROP PROCEDURE IF EXISTS sp_currency_create;
    `);

    await queryRunner.query(`
      CREATE PROCEDURE sp_currency_create(
        IN p_symbol VARCHAR(16),
        IN p_name VARCHAR(64),
        IN p_precision_scale TINYINT,
        IN p_min_withdraw DECIMAL(36, 18),
        IN p_is_tradable BOOLEAN,
        IN p_is_active BOOLEAN,
        OUT p_currency_id INT
      )
      BEGIN
        DECLARE EXIT HANDLER FOR SQLEXCEPTION
        BEGIN
          ROLLBACK;
          RESIGNAL;
        END;

        START TRANSACTION;

        -- Check if symbol already exists
        IF EXISTS (SELECT 1 FROM currencies WHERE symbol = UPPER(p_symbol)) THEN
          SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Currency symbol already exists';
        END IF;

        -- Insert new currency
        INSERT INTO currencies (
          symbol,
          name,
          precision_scale,
          min_withdraw,
          is_tradable,
          is_active
        ) VALUES (
          UPPER(p_symbol),
          p_name,
          p_precision_scale,
          p_min_withdraw,
          p_is_tradable,
          p_is_active
        );

        SET p_currency_id = LAST_INSERT_ID();

        COMMIT;
      END;
    `);

    // ============================================
    // PROCEDURE 6: sp_currency_update
    // Purpose: Update currency
    // ============================================
    await queryRunner.query(`
      DROP PROCEDURE IF EXISTS sp_currency_update;
    `);

    await queryRunner.query(`
      CREATE PROCEDURE sp_currency_update(
        IN p_currency_id INT,
        IN p_symbol VARCHAR(16),
        IN p_name VARCHAR(64),
        IN p_precision_scale TINYINT,
        IN p_min_withdraw DECIMAL(36, 18),
        IN p_is_tradable BOOLEAN,
        IN p_is_active BOOLEAN
      )
      BEGIN
        DECLARE EXIT HANDLER FOR SQLEXCEPTION
        BEGIN
          ROLLBACK;
          RESIGNAL;
        END;

        START TRANSACTION;

        -- Check if currency exists
        IF NOT EXISTS (SELECT 1 FROM currencies WHERE currency_id = p_currency_id) THEN
          SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Currency not found';
        END IF;

        -- Check if new symbol conflicts (if symbol is being updated)
        IF p_symbol IS NOT NULL AND p_symbol != '' THEN
          IF EXISTS (
            SELECT 1 FROM currencies 
            WHERE symbol = UPPER(p_symbol) 
            AND currency_id != p_currency_id
          ) THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Currency symbol already exists';
          END IF;
        END IF;

        -- Update currency (only update non-null fields)
        UPDATE currencies
        SET
          symbol = IFNULL(UPPER(p_symbol), symbol),
          name = IFNULL(p_name, name),
          precision_scale = IFNULL(p_precision_scale, precision_scale),
          min_withdraw = IFNULL(p_min_withdraw, min_withdraw),
          is_tradable = IFNULL(p_is_tradable, is_tradable),
          is_active = IFNULL(p_is_active, is_active),
          updated_at = CURRENT_TIMESTAMP
        WHERE currency_id = p_currency_id;

        COMMIT;
      END;
    `);

    // ============================================
    // PROCEDURE 7: sp_currency_delete
    // Purpose: Soft delete currency (set is_active = false)
    // ============================================
    await queryRunner.query(`
      DROP PROCEDURE IF EXISTS sp_currency_delete;
    `);

    await queryRunner.query(`
      CREATE PROCEDURE sp_currency_delete(
        IN p_currency_id INT
      )
      BEGIN
        DECLARE EXIT HANDLER FOR SQLEXCEPTION
        BEGIN
          ROLLBACK;
          RESIGNAL;
        END;

        START TRANSACTION;

        -- Check if currency exists
        IF NOT EXISTS (SELECT 1 FROM currencies WHERE currency_id = p_currency_id) THEN
          SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Currency not found';
        END IF;

        -- Soft delete: set is_active = false
        UPDATE currencies
        SET
          is_active = FALSE,
          updated_at = CURRENT_TIMESTAMP
        WHERE currency_id = p_currency_id;

        COMMIT;
      END;
    `);

    // ============================================
    // PROCEDURE 8: sp_currency_symbol_exists
    // Purpose: Check if symbol exists
    // ============================================
    await queryRunner.query(`
      DROP PROCEDURE IF EXISTS sp_currency_symbol_exists;
    `);

    await queryRunner.query(`
      CREATE PROCEDURE sp_currency_symbol_exists(
        IN p_symbol VARCHAR(16),
        IN p_exclude_currency_id INT,
        OUT p_exists BOOLEAN
      )
      BEGIN
        IF p_exclude_currency_id IS NOT NULL THEN
          SELECT EXISTS(
            SELECT 1 FROM currencies 
            WHERE symbol = UPPER(p_symbol) 
            AND currency_id != p_exclude_currency_id
          ) INTO p_exists;
        ELSE
          SELECT EXISTS(
            SELECT 1 FROM currencies 
            WHERE symbol = UPPER(p_symbol)
          ) INTO p_exists;
        END IF;
      END;
    `);

    // ============================================
    // PROCEDURE 9: sp_currency_find_active
    // Purpose: Find all active currencies
    // ============================================
    await queryRunner.query(`
      DROP PROCEDURE IF EXISTS sp_currency_find_active;
    `);

    await queryRunner.query(`
      CREATE PROCEDURE sp_currency_find_active()
      BEGIN
        SELECT 
          currency_id,
          symbol,
          name,
          precision_scale,
          min_withdraw,
          is_tradable,
          is_active
        FROM currencies
        WHERE is_active = TRUE
        ORDER BY symbol ASC;
      END;
    `);

    // ============================================
    // PROCEDURE 10: sp_currency_find_tradable
    // Purpose: Find all tradable currencies
    // ============================================
    await queryRunner.query(`
      DROP PROCEDURE IF EXISTS sp_currency_find_tradable;
    `);

    await queryRunner.query(`
      CREATE PROCEDURE sp_currency_find_tradable()
      BEGIN
        SELECT 
          currency_id,
          symbol,
          name,
          precision_scale,
          min_withdraw,
          is_tradable,
          is_active
        FROM currencies
        WHERE is_tradable = TRUE
        AND is_active = TRUE
        ORDER BY symbol ASC;
      END;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop all procedures
    await queryRunner.query(`DROP PROCEDURE IF EXISTS sp_currency_find_by_id;`);
    await queryRunner.query(`DROP PROCEDURE IF EXISTS sp_currency_find_by_symbol;`);
    await queryRunner.query(`DROP PROCEDURE IF EXISTS sp_currency_find_all;`);
    await queryRunner.query(`DROP PROCEDURE IF EXISTS sp_currency_count;`);
    await queryRunner.query(`DROP PROCEDURE IF EXISTS sp_currency_create;`);
    await queryRunner.query(`DROP PROCEDURE IF EXISTS sp_currency_update;`);
    await queryRunner.query(`DROP PROCEDURE IF EXISTS sp_currency_delete;`);
    await queryRunner.query(`DROP PROCEDURE IF EXISTS sp_currency_symbol_exists;`);
    await queryRunner.query(`DROP PROCEDURE IF EXISTS sp_currency_find_active;`);
    await queryRunner.query(`DROP PROCEDURE IF EXISTS sp_currency_find_tradable;`);
  }
}
