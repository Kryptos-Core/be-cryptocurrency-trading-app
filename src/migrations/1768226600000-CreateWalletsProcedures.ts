import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Create Stored Procedures for Wallets
 *
 * Stored Procedures được tạo để:
 * - Tăng security (SQL injection protection)
 * - Tăng performance (DB-level transaction management)
 * - Quản lý balance atomically với pessimistic locking
 * - Double-entry accounting cho wallet ledger
 *
 * Design Pattern: Database Procedure Pattern + Unit of Work Pattern
 */
export class CreateWalletsProcedures1768226600000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ============================================
    // PROCEDURE 1: sp_wallet_find_by_user_currency
    // Purpose: Find wallet by user and currency
    // ============================================
    await queryRunner.query(`
      DROP PROCEDURE IF EXISTS sp_wallet_find_by_user_currency;
    `);

    await queryRunner.query(`
      CREATE PROCEDURE sp_wallet_find_by_user_currency(
        IN p_user_id BIGINT,
        IN p_currency_id INT
      )
      READS SQL DATA
      BEGIN
        SELECT 
          wallet_id,
          user_id,
          currency_id,
          available,
          frozen,
          updated_at
        FROM wallets
        WHERE user_id = p_user_id
          AND currency_id = p_currency_id
        LIMIT 1;
      END;
    `);

    // ============================================
    // PROCEDURE 2: sp_wallet_get_or_create_for_update
    // Purpose: Get or create wallet with pessimistic write lock
    // ============================================
    await queryRunner.query(`
      DROP PROCEDURE IF EXISTS sp_wallet_get_or_create_for_update;
    `);

    await queryRunner.query(`
      CREATE PROCEDURE sp_wallet_get_or_create_for_update(
        IN p_user_id BIGINT,
        IN p_currency_id INT
      )
      MODIFIES SQL DATA
      BEGIN
        DECLARE EXIT HANDLER FOR SQLEXCEPTION
        BEGIN
          ROLLBACK;
          RESIGNAL;
        END;

        START TRANSACTION;

        -- Get existing wallet with write lock
        SELECT 
          wallet_id,
          user_id,
          currency_id,
          available,
          frozen,
          updated_at
        FROM wallets
        WHERE user_id = p_user_id
          AND currency_id = p_currency_id
        LIMIT 1
        FOR UPDATE;

        -- If not exists, create new
        IF ROW_COUNT() = 0 THEN
          INSERT INTO wallets (user_id, currency_id, available, frozen)
          VALUES (p_user_id, p_currency_id, '0', '0');
        END IF;

        -- Return wallet with lock still held
        SELECT 
          wallet_id,
          user_id,
          currency_id,
          available,
          frozen,
          updated_at
        FROM wallets
        WHERE user_id = p_user_id
          AND currency_id = p_currency_id
        LIMIT 1
        FOR UPDATE;

        COMMIT;
      END;
    `);

    // ============================================
    // PROCEDURE 3: sp_wallet_apply_balance_delta
    // Purpose: Apply balance changes safely with validation
    // ============================================
    await queryRunner.query(`
      DROP PROCEDURE IF EXISTS sp_wallet_apply_balance_delta;
    `);

    await queryRunner.query(`
      CREATE PROCEDURE sp_wallet_apply_balance_delta(
        IN p_wallet_id BIGINT,
        IN p_delta_available DECIMAL(36, 18),
        IN p_delta_frozen DECIMAL(36, 18)
      )
      MODIFIES SQL DATA
      BEGIN
        DECLARE v_new_available DECIMAL(36, 18);
        DECLARE v_new_frozen DECIMAL(36, 18);
        DECLARE EXIT HANDLER FOR SQLEXCEPTION
        BEGIN
          ROLLBACK;
          RESIGNAL;
        END;

        START TRANSACTION;

        -- Calculate new balances and validate
        SELECT 
          available + p_delta_available,
          frozen + p_delta_frozen
        INTO v_new_available, v_new_frozen
        FROM wallets
        WHERE wallet_id = p_wallet_id
        FOR UPDATE;

        -- Validate balances don't go negative
        IF v_new_available < 0 OR v_new_frozen < 0 THEN
          SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Insufficient balance';
        END IF;

        -- Update wallet
        UPDATE wallets
        SET
          available = v_new_available,
          frozen = v_new_frozen,
          updated_at = CURRENT_TIMESTAMP
        WHERE wallet_id = p_wallet_id;

        -- Return updated row count and data
        SELECT 1 as affected;
        SELECT 
          wallet_id,
          user_id,
          currency_id,
          available,
          frozen,
          updated_at
        FROM wallets
        WHERE wallet_id = p_wallet_id;

        COMMIT;
      END;
    `);

    // ============================================
    // PROCEDURE 4: sp_wallet_ledger_create
    // Purpose: Create wallet ledger entry for audit trail
    // ============================================
    await queryRunner.query(`
      DROP PROCEDURE IF EXISTS sp_wallet_ledger_create;
    `);

    await queryRunner.query(`
      CREATE PROCEDURE sp_wallet_ledger_create(
        IN p_user_id BIGINT,
        IN p_currency_id INT,
        IN p_ref_type ENUM('DEPOSIT', 'WITHDRAW', 'ORDER', 'TRADE', 'ADJUST', 'TRANSFER', 'EXTERNAL_DEPOSIT', 'EXTERNAL_WITHDRAWAL', 'EXTERNAL_SYNC', 'RECONCILIATION'),
        IN p_ref_id BIGINT,
        IN p_direction ENUM('CREDIT', 'DEBIT'),
        IN p_amount DECIMAL(36, 18),
        IN p_balance_after DECIMAL(36, 18)
      )
      MODIFIES SQL DATA
      BEGIN
        DECLARE v_ledger_id BIGINT;
        DECLARE EXIT HANDLER FOR SQLEXCEPTION
        BEGIN
          ROLLBACK;
          RESIGNAL;
        END;

        START TRANSACTION;

        -- Insert ledger entry
        INSERT INTO wallet_ledger (
          user_id,
          currency_id,
          ref_type,
          ref_id,
          direction,
          amount,
          balance_after
        ) VALUES (
          p_user_id,
          p_currency_id,
          p_ref_type,
          p_ref_id,
          p_direction,
          p_amount,
          p_balance_after
        );

        SET v_ledger_id = LAST_INSERT_ID();

        -- Return created ledger entry
        SELECT 
          ledger_id,
          user_id,
          currency_id,
          ref_type,
          ref_id,
          direction,
          amount,
          balance_after,
          created_at
        FROM wallet_ledger
        WHERE ledger_id = v_ledger_id;

        COMMIT;
      END;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop all procedures
    await queryRunner.query(`DROP PROCEDURE IF EXISTS sp_wallet_find_by_user_currency;`);
    await queryRunner.query(`DROP PROCEDURE IF EXISTS sp_wallet_get_or_create_for_update;`);
    await queryRunner.query(`DROP PROCEDURE IF EXISTS sp_wallet_apply_balance_delta;`);
    await queryRunner.query(`DROP PROCEDURE IF EXISTS sp_wallet_ledger_create;`);
  }
}
