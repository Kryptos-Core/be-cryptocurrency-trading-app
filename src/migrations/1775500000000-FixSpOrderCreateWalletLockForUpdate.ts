import { MigrationInterface, QueryRunner } from 'typeorm';

async function runProcedureSql(queryRunner: QueryRunner, sql: string): Promise<void> {
  const conn = (queryRunner as any).connection?.driver?.options?.type === 'mariadb'
    ? (queryRunner as any).connection.master
    : (queryRunner as any).connection;
  const raw = conn?.queryRunner?.connection ?? conn?.connection ?? conn;
  if (raw?.query) {
    await raw.query(sql);
    return;
  }
  await queryRunner.query(sql);
}

/**
 * Fix sp_order_create: add SELECT … FOR UPDATE on wallet rows before balance check.
 *
 * WHY:
 *   The previous version used a plain SELECT (non-locking read) to fetch wallet.available.
 *   Two concurrent CREATE ORDER calls (e.g. from Promise.all batch) could both read the
 *   same available balance, both pass the check, and both decrement → negative available
 *   (overdraft / bad debt).
 *
 *   Adding FOR UPDATE acquires a row-level exclusive lock so the second transaction must
 *   wait until the first commits, then reads the already-decremented balance and correctly
 *   fails with INSUFFICIENT_BALANCE.
 *
 * NOTE:
 *   InnoDB transaction isolation is REPEATABLE READ by default, but SELECT … FOR UPDATE
 *   always reads the latest committed version regardless of isolation level, which is
 *   exactly what we need here.
 */
export class FixSpOrderCreateWalletLockForUpdate1775500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
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
    -- FOR UPDATE: acquire row-level lock before reading available balance.
    -- Prevents concurrent requests from both reading the same balance and both passing
    -- the check (overdraft race condition).
    SELECT COALESCE(available, 0) INTO v_quote_available
    FROM wallets WHERE user_id = p_user_id AND currency_id = v_quote_currency_id LIMIT 1
    FOR UPDATE;
    SET v_reserve_quote = IF(p_type = 'LIMIT', p_amount * p_price, 0);
    IF v_quote_available IS NULL OR v_quote_available < v_reserve_quote THEN
      SET p_error_code = 'INSUFFICIENT_BALANCE';
      SET p_error_message = 'Insufficient quote balance';
      LEAVE proc_label;
    END IF;
  ELSE
    -- FOR UPDATE: same pattern for base wallet.
    SELECT COALESCE(available, 0) INTO v_base_available
    FROM wallets WHERE user_id = p_user_id AND currency_id = v_base_currency_id LIMIT 1
    FOR UPDATE;
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
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restore previous non-locking version (identical to RecreateOrdersProceduresUuidV7 content).
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
  }
}
