import type { MigrationInterface, QueryRunner } from 'typeorm';
import { runProcedureSql } from './helpers/raw-procedure-connection.util';

/**
 * Recreate Orders stored procedures for UUID v7 (CHAR(36) for order_id, user_id, pair_id).
 * Run after ConvertAllIdsToUuidV7 (which drops these procedures).
 */
export class RecreateOrdersProceduresUuidV71768228000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ----- sp_order_find_by_id -----
    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_order_find_by_id');
    await queryRunner.query(`
      CREATE PROCEDURE sp_order_find_by_id(IN p_order_id CHAR(36))
      READS SQL DATA
      BEGIN
        SELECT order_id, user_id, pair_id, side, type, price, amount, filled_amount, avg_price,
               status, time_in_force, reserved_quote, reserved_base, client_order_id, idempotency_key,
               created_at, updated_at
        FROM orders WHERE order_id = p_order_id LIMIT 1;
      END;
    `);

    // ----- sp_order_find_by_user_idempotency -----
    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_order_find_by_user_idempotency');
    await queryRunner.query(`
      CREATE PROCEDURE sp_order_find_by_user_idempotency(
        IN p_user_id CHAR(36),
        IN p_idempotency_key VARCHAR(64)
      )
      READS SQL DATA
      BEGIN
        SELECT order_id, user_id, pair_id, side, type, price, amount, filled_amount, avg_price,
               status, time_in_force, reserved_quote, reserved_base, client_order_id, idempotency_key,
               created_at, updated_at
        FROM orders
        WHERE user_id = p_user_id AND idempotency_key = p_idempotency_key
        LIMIT 1;
      END;
    `);

    // ----- sp_order_book (exclude price <= 0) -----
    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_order_book');
    await queryRunner.query(`
      CREATE PROCEDURE sp_order_book(
        IN p_pair_id CHAR(36),
        IN p_side VARCHAR(4),
        IN p_limit INT
      )
      READS SQL DATA
      BEGIN
        SELECT price, SUM(amount - filled_amount) AS remaining, COUNT(*) AS order_count
        FROM orders
        WHERE pair_id = p_pair_id AND side = p_side AND status IN ('OPEN', 'PARTIAL')
          AND price IS NOT NULL AND price > 0
        GROUP BY price
        ORDER BY price ASC
        LIMIT p_limit;
      END;
    `);

    // ----- sp_order_create (order_id IN, no OUT) -----
    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_order_create');
    const spOrderCreate = `
CREATE PROCEDURE sp_order_create(
  IN p_order_id CHAR(36),
  IN p_user_id CHAR(36),
  IN p_pair_id CHAR(36),
  IN p_side VARCHAR(4),
  IN p_type VARCHAR(6),
  IN p_price DECIMAL(36,18),
  IN p_amount DECIMAL(36,18),
  IN p_time_in_force VARCHAR(3),
  IN p_client_order_id VARCHAR(64),
  IN p_idempotency_key VARCHAR(64),
  OUT p_error_code VARCHAR(32),
  OUT p_error_message VARCHAR(255)
)
MODIFIES SQL DATA
proc_label: BEGIN
  DECLARE v_base_currency_id CHAR(36) DEFAULT NULL;
  DECLARE v_quote_currency_id CHAR(36) DEFAULT NULL;
  DECLARE v_min_order_amount DECIMAL(36,18) DEFAULT NULL;
  DECLARE v_quote_available DECIMAL(36,18) DEFAULT NULL;
  DECLARE v_base_available DECIMAL(36,18) DEFAULT NULL;
  DECLARE v_reserve_quote DECIMAL(36,18) DEFAULT 0;
  DECLARE v_reserve_base DECIMAL(36,18) DEFAULT 0;

  SET p_error_code = NULL;
  SET p_error_message = NULL;

  SELECT base_currency_id, quote_currency_id, min_order_amount
  INTO v_base_currency_id, v_quote_currency_id, v_min_order_amount
  FROM market_pairs WHERE pair_id = p_pair_id AND is_active = 1 LIMIT 1;

  IF v_base_currency_id IS NULL THEN
    SET p_error_code = 'PAIR_NOT_FOUND';
    SET p_error_message = 'Market pair not found or inactive';
    LEAVE proc_label;
  END IF;

  IF p_type = 'LIMIT' AND (p_price IS NULL OR p_price <= 0) THEN
    SET p_error_code = 'INVALID_PRICE';
    SET p_error_message = 'Limit order requires positive price';
    LEAVE proc_label;
  END IF;

  IF p_amount IS NULL OR p_amount < v_min_order_amount THEN
    SET p_error_code = 'INVALID_AMOUNT';
    SET p_error_message = 'Amount below minimum';
    LEAVE proc_label;
  END IF;

  IF p_side = 'BUY' THEN
    SELECT COALESCE(available, 0) INTO v_quote_available
    FROM wallets WHERE user_id = p_user_id AND currency_id = v_quote_currency_id LIMIT 1;
    SET v_reserve_quote = IF(p_type = 'LIMIT', p_amount * p_price, 0);
    IF v_quote_available IS NULL OR v_quote_available < v_reserve_quote THEN
      SET p_error_code = 'INSUFFICIENT_BALANCE';
      SET p_error_message = 'Insufficient quote balance';
      LEAVE proc_label;
    END IF;
  ELSE
    SELECT COALESCE(available, 0) INTO v_base_available
    FROM wallets WHERE user_id = p_user_id AND currency_id = v_base_currency_id LIMIT 1;
    SET v_reserve_base = p_amount;
    IF v_base_available IS NULL OR v_base_available < v_reserve_base THEN
      SET p_error_code = 'INSUFFICIENT_BALANCE';
      SET p_error_message = 'Insufficient base balance';
      LEAVE proc_label;
    END IF;
  END IF;

  INSERT INTO orders (order_id, user_id, pair_id, side, type, price, amount, filled_amount, status, time_in_force, reserved_quote, reserved_base, client_order_id, idempotency_key, created_at, updated_at)
  VALUES (p_order_id, p_user_id, p_pair_id, p_side, p_type, p_price, p_amount, 0, 'OPEN', COALESCE(p_time_in_force, 'GTC'), v_reserve_quote, v_reserve_base, p_client_order_id, p_idempotency_key, NOW(6), NOW(6));

  IF v_reserve_quote > 0 THEN
    UPDATE wallets SET available = available - v_reserve_quote, frozen = frozen + v_reserve_quote, updated_at = NOW(6)
    WHERE user_id = p_user_id AND currency_id = v_quote_currency_id;
  END IF;
  IF v_reserve_base > 0 THEN
    UPDATE wallets SET available = available - v_reserve_base, frozen = frozen + v_reserve_base, updated_at = NOW(6)
    WHERE user_id = p_user_id AND currency_id = v_base_currency_id;
  END IF;
END;
`;
    await runProcedureSql(queryRunner, spOrderCreate);

    // ----- sp_order_cancel -----
    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_order_cancel');
    const spOrderCancel = `
CREATE PROCEDURE sp_order_cancel(
  IN p_order_id CHAR(36),
  IN p_user_id CHAR(36),
  OUT p_cancelled TINYINT,
  OUT p_error_code VARCHAR(32),
  OUT p_error_message VARCHAR(255)
)
MODIFIES SQL DATA
proc_label: BEGIN
  DECLARE v_user_id CHAR(36) DEFAULT NULL;
  DECLARE v_status VARCHAR(16) DEFAULT NULL;
  DECLARE v_reserved_quote DECIMAL(36,18) DEFAULT 0;
  DECLARE v_reserved_base DECIMAL(36,18) DEFAULT 0;
  DECLARE v_pair_id CHAR(36) DEFAULT NULL;
  DECLARE v_quote_currency_id CHAR(36) DEFAULT NULL;
  DECLARE v_base_currency_id CHAR(36) DEFAULT NULL;

  SET p_cancelled = 0;
  SET p_error_code = NULL;
  SET p_error_message = NULL;

  SELECT user_id, status, reserved_quote, reserved_base, pair_id
  INTO v_user_id, v_status, v_reserved_quote, v_reserved_base, v_pair_id
  FROM orders WHERE order_id = p_order_id LIMIT 1;

  IF v_user_id IS NULL THEN
    SET p_error_code = 'ORDER_NOT_FOUND';
    SET p_error_message = 'Order not found';
    LEAVE proc_label;
  END IF;

  IF v_user_id != p_user_id THEN
    SET p_error_code = 'FORBIDDEN';
    SET p_error_message = 'Not your order';
    LEAVE proc_label;
  END IF;

  IF v_status NOT IN ('OPEN', 'PARTIAL') THEN
    SET p_error_code = 'INVALID_STATE';
    SET p_error_message = 'Order cannot be cancelled';
    LEAVE proc_label;
  END IF;

  SELECT base_currency_id, quote_currency_id INTO v_base_currency_id, v_quote_currency_id
  FROM market_pairs WHERE pair_id = v_pair_id LIMIT 1;

  UPDATE orders SET status = 'CANCELLED', updated_at = NOW(6) WHERE order_id = p_order_id;
  SET p_cancelled = 1;

  IF v_reserved_quote > 0 AND v_quote_currency_id IS NOT NULL THEN
    UPDATE wallets SET available = available + v_reserved_quote, frozen = frozen - v_reserved_quote, updated_at = NOW(6)
    WHERE user_id = p_user_id AND currency_id = v_quote_currency_id;
  END IF;
  IF v_reserved_base > 0 AND v_base_currency_id IS NOT NULL THEN
    UPDATE wallets SET available = available + v_reserved_base, frozen = frozen - v_reserved_base, updated_at = NOW(6)
    WHERE user_id = p_user_id AND currency_id = v_base_currency_id;
  END IF;
END;
`;
    await runProcedureSql(queryRunner, spOrderCancel);

    // ----- sp_order_find_by_user -----
    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_order_find_by_user');
    const spOrderFindByUser = `
CREATE PROCEDURE sp_order_find_by_user(
  IN p_user_id CHAR(36),
  IN p_status VARCHAR(32),
  IN p_skip INT,
  IN p_limit INT
)
READS SQL DATA
BEGIN
  IF p_status IS NULL OR p_status = '' THEN
    SELECT order_id, user_id, pair_id, side, type, price, amount, filled_amount, avg_price, status, time_in_force, reserved_quote, reserved_base, client_order_id, idempotency_key, created_at, updated_at
    FROM orders WHERE user_id = p_user_id
    ORDER BY created_at DESC LIMIT p_skip, p_limit;
  ELSE
    SELECT order_id, user_id, pair_id, side, type, price, amount, filled_amount, avg_price, status, time_in_force, reserved_quote, reserved_base, client_order_id, idempotency_key, created_at, updated_at
    FROM orders WHERE user_id = p_user_id AND status = p_status
    ORDER BY created_at DESC LIMIT p_skip, p_limit;
  END IF;
END;
`;
    await runProcedureSql(queryRunner, spOrderFindByUser);

    // ----- sp_order_count_by_user -----
    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_order_count_by_user');
    const spOrderCountByUser = `
CREATE PROCEDURE sp_order_count_by_user(
  IN p_user_id CHAR(36),
  IN p_status VARCHAR(32)
)
READS SQL DATA
BEGIN
  IF p_status IS NULL OR p_status = '' THEN
    SELECT COUNT(*) AS total FROM orders WHERE user_id = p_user_id;
  ELSE
    SELECT COUNT(*) AS total FROM orders WHERE user_id = p_user_id AND status = p_status;
  END IF;
END;
`;
    await runProcedureSql(queryRunner, spOrderCountByUser);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_order_count_by_user');
    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_order_find_by_user');
    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_order_cancel');
    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_order_create');
    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_order_book');
    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_order_find_by_user_idempotency');
    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_order_find_by_id');
  }
}
