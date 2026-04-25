import type { MigrationInterface, QueryRunner } from 'typeorm';
import { runProcedureSql } from './helpers/raw-procedure-connection.util';

/**
 * Matching engine hardening:
 * - orders.slippage_tolerance for MARKET orders (FOK/slippage + client visibility)
 * - sp_order_create: MARKET BUY freezes quote via p_market_buy_reserved_quote
 * - sp_trade_execute: taker BUY pays quote from frozen then available (MARKET BUY fix)
 * - Readers updated to return slippage_tolerance
 *
 * Revert: down() is intentionally not implemented — restoring prior stored procedures + column
 * safely requires a DB backup or manually re-applying migrations 177550 (sp_order_create) and
 * 177545 (sp_trade_execute) plus dropping column slippage_tolerance. See README "Matching engine".
 */
export class MatchingEngineHardening1775510000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE orders
      ADD COLUMN slippage_tolerance DECIMAL(36,18) NULL
      AFTER idempotency_key
    `);

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
  IN p_slippage_tolerance DECIMAL(36,18),
  IN p_market_buy_reserved_quote DECIMAL(36,18),
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
    FROM wallets WHERE user_id = p_user_id AND currency_id = v_quote_currency_id LIMIT 1
    FOR UPDATE;

    IF p_type = 'LIMIT' THEN
      SET v_reserve_quote = p_amount * p_price;
    ELSE
      IF p_market_buy_reserved_quote IS NULL OR p_market_buy_reserved_quote <= 0 THEN
        SET p_error_code = 'INVALID_MARKET_BUY_RESERVE';
        SET p_error_message = 'MARKET BUY requires a positive reserved quote';
        LEAVE proc_label;
      END IF;
      SET v_reserve_quote = p_market_buy_reserved_quote;
    END IF;

    IF v_quote_available IS NULL OR v_quote_available < v_reserve_quote THEN
      SET p_error_code = 'INSUFFICIENT_BALANCE';
      SET p_error_message = 'Insufficient quote balance';
      LEAVE proc_label;
    END IF;
  ELSE
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

  INSERT INTO orders (
    order_id, user_id, pair_id, side, type, price, amount, filled_amount, status,
    time_in_force, reserved_quote, reserved_base, client_order_id, idempotency_key,
    slippage_tolerance, created_at, updated_at
  )
  VALUES (
    p_order_id, p_user_id, p_pair_id, p_side, p_type, p_price, p_amount, 0, 'OPEN',
    COALESCE(p_time_in_force, 'GTC'), v_reserve_quote, v_reserve_base, p_client_order_id, p_idempotency_key,
    p_slippage_tolerance, NOW(6), NOW(6)
  );

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

    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_trade_execute');
    const spTradeExecute = `
CREATE PROCEDURE sp_trade_execute(
  IN p_pair_id CHAR(36),
  IN p_maker_order_id CHAR(36),
  IN p_taker_order_id CHAR(36),
  IN p_price DECIMAL(36,18),
  IN p_amount DECIMAL(36,18),
  IN p_fee_currency_id CHAR(36),
  IN p_taker_fee DECIMAL(36,18),
  IN p_maker_fee DECIMAL(36,18),
  OUT p_trade_id CHAR(36),
  OUT p_error_code VARCHAR(32),
  OUT p_error_message VARCHAR(255)
)
MODIFIES SQL DATA
proc_label: BEGIN
  DECLARE v_trade_id CHAR(36) DEFAULT NULL;
  DECLARE v_maker_user_id CHAR(36) DEFAULT NULL;
  DECLARE v_taker_user_id CHAR(36) DEFAULT NULL;
  DECLARE v_maker_side VARCHAR(4) DEFAULT NULL;
  DECLARE v_base_currency_id CHAR(36) DEFAULT NULL;
  DECLARE v_quote_currency_id CHAR(36) DEFAULT NULL;
  DECLARE v_quote_delta DECIMAL(36,18) DEFAULT 0;
  DECLARE v_maker_remaining DECIMAL(36,18) DEFAULT 0;
  DECLARE v_taker_remaining DECIMAL(36,18) DEFAULT 0;

  DECLARE v_tq_frozen DECIMAL(36,18) DEFAULT 0;
  DECLARE v_tq_available DECIMAL(36,18) DEFAULT 0;
  DECLARE v_from_frozen DECIMAL(36,18) DEFAULT 0;
  DECLARE v_from_available DECIMAL(36,18) DEFAULT 0;

  DECLARE v_maker_base_wallet_id CHAR(36) DEFAULT NULL;
  DECLARE v_maker_quote_wallet_id CHAR(36) DEFAULT NULL;
  DECLARE v_taker_base_wallet_id CHAR(36) DEFAULT NULL;
  DECLARE v_taker_quote_wallet_id CHAR(36) DEFAULT NULL;

  DECLARE v_maker_base_balance_after DECIMAL(36,18) DEFAULT NULL;
  DECLARE v_maker_quote_balance_after DECIMAL(36,18) DEFAULT NULL;
  DECLARE v_taker_base_balance_after DECIMAL(36,18) DEFAULT NULL;
  DECLARE v_taker_quote_balance_after DECIMAL(36,18) DEFAULT NULL;

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  SET p_trade_id = NULL;
  SET p_error_code = NULL;
  SET p_error_message = NULL;

  IF p_amount IS NULL OR p_amount <= 0 OR p_price IS NULL OR p_price <= 0 THEN
    SET p_error_code = 'INVALID_TRADE_INPUT';
    SET p_error_message = 'Trade amount and price must be positive';
    LEAVE proc_label;
  END IF;

  SET v_quote_delta = p_amount * p_price;

  START TRANSACTION;

  SELECT TRIM(user_id), side, (amount - filled_amount)
  INTO v_maker_user_id, v_maker_side, v_maker_remaining
  FROM orders
  WHERE order_id = p_maker_order_id
  FOR UPDATE;

  SELECT TRIM(user_id), (amount - filled_amount)
  INTO v_taker_user_id, v_taker_remaining
  FROM orders
  WHERE order_id = p_taker_order_id
  FOR UPDATE;

  IF v_maker_user_id IS NULL OR v_taker_user_id IS NULL THEN
    SET p_error_code = 'ORDER_NOT_FOUND';
    SET p_error_message = 'Maker or taker order not found';
    ROLLBACK;
    LEAVE proc_label;
  END IF;

  IF v_maker_remaining <= 0 OR v_taker_remaining <= 0 THEN
    SET p_error_code = 'ORDER_NOT_OPEN';
    SET p_error_message = 'Maker or taker order has no remaining quantity';
    ROLLBACK;
    LEAVE proc_label;
  END IF;

  IF p_amount > v_maker_remaining OR p_amount > v_taker_remaining THEN
    SET p_error_code = 'OVERFILL_ATTEMPT';
    SET p_error_message = 'Requested fill amount exceeds current DB remaining';
    ROLLBACK;
    LEAVE proc_label;
  END IF;

  SELECT TRIM(base_currency_id), TRIM(quote_currency_id)
  INTO v_base_currency_id, v_quote_currency_id
  FROM market_pairs
  WHERE TRIM(pair_id) = TRIM(p_pair_id)
  LIMIT 1;

  IF v_base_currency_id IS NULL OR v_quote_currency_id IS NULL THEN
    SET p_error_code = 'PAIR_NOT_FOUND';
    SET p_error_message = 'Market pair not found';
    ROLLBACK;
    LEAVE proc_label;
  END IF;

  INSERT IGNORE INTO wallets (wallet_id, user_id, currency_id, available, frozen)
  VALUES (UUID(), v_maker_user_id, v_base_currency_id, '0', '0');

  INSERT IGNORE INTO wallets (wallet_id, user_id, currency_id, available, frozen)
  VALUES (UUID(), v_maker_user_id, v_quote_currency_id, '0', '0');

  INSERT IGNORE INTO wallets (wallet_id, user_id, currency_id, available, frozen)
  VALUES (UUID(), v_taker_user_id, v_base_currency_id, '0', '0');

  INSERT IGNORE INTO wallets (wallet_id, user_id, currency_id, available, frozen)
  VALUES (UUID(), v_taker_user_id, v_quote_currency_id, '0', '0');

  SET v_trade_id = UUID();

  INSERT INTO trades (
    trade_id, pair_id, taker_order_id, maker_order_id, price, amount, taker_fee, maker_fee, fee_currency_id, created_at
  ) VALUES (
    v_trade_id, p_pair_id, p_taker_order_id, p_maker_order_id, p_price, p_amount, p_taker_fee, p_maker_fee, p_fee_currency_id, NOW(6)
  );

  UPDATE orders SET
    filled_amount = filled_amount + p_amount,
    avg_price = (COALESCE(avg_price, 0) * filled_amount + p_price * p_amount) / (filled_amount + p_amount),
    status = IF((v_maker_remaining - p_amount) <= 0, 'FILLED', 'PARTIAL'),
    reserved_quote = IF(side = 'BUY', GREATEST(0, reserved_quote - v_quote_delta), reserved_quote),
    reserved_base = IF(side = 'SELL', GREATEST(0, reserved_base - p_amount), reserved_base),
    updated_at = NOW(6)
  WHERE order_id = p_maker_order_id;

  UPDATE orders SET
    filled_amount = filled_amount + p_amount,
    avg_price = (COALESCE(avg_price, 0) * filled_amount + p_price * p_amount) / (filled_amount + p_amount),
    status = IF((v_taker_remaining - p_amount) <= 0, 'FILLED', 'PARTIAL'),
    reserved_quote = IF(side = 'BUY', GREATEST(0, reserved_quote - v_quote_delta), reserved_quote),
    reserved_base = IF(side = 'SELL', GREATEST(0, reserved_base - p_amount), reserved_base),
    updated_at = NOW(6)
  WHERE order_id = p_taker_order_id;

  IF v_maker_side = 'SELL' THEN
    UPDATE wallets SET frozen = GREATEST(0, frozen - p_amount), updated_at = NOW(6)
    WHERE user_id = v_maker_user_id AND currency_id = v_base_currency_id;

    UPDATE wallets SET available = available + v_quote_delta - p_maker_fee, updated_at = NOW(6)
    WHERE user_id = v_maker_user_id AND currency_id = v_quote_currency_id;

    SELECT frozen, COALESCE(available, 0) INTO v_tq_frozen, v_tq_available
    FROM wallets
    WHERE user_id = v_taker_user_id AND currency_id = v_quote_currency_id
    LIMIT 1
    FOR UPDATE;

    SET v_from_frozen = LEAST(COALESCE(v_tq_frozen, 0), v_quote_delta);
    SET v_from_available = v_quote_delta - v_from_frozen;

    IF v_from_available > COALESCE(v_tq_available, 0) THEN
      SET p_error_code = 'INSUFFICIENT_BALANCE';
      SET p_error_message = 'Taker quote wallet cannot cover trade';
      ROLLBACK;
      LEAVE proc_label;
    END IF;

    UPDATE wallets SET
      frozen = frozen - v_from_frozen,
      available = available - v_from_available,
      updated_at = NOW(6)
    WHERE user_id = v_taker_user_id AND currency_id = v_quote_currency_id;

    UPDATE wallets SET available = available + p_amount - p_taker_fee, updated_at = NOW(6)
    WHERE user_id = v_taker_user_id AND currency_id = v_base_currency_id;
  ELSE
    UPDATE wallets SET frozen = GREATEST(0, frozen - v_quote_delta), updated_at = NOW(6)
    WHERE user_id = v_maker_user_id AND currency_id = v_quote_currency_id;

    UPDATE wallets SET available = available + p_amount - p_maker_fee, updated_at = NOW(6)
    WHERE user_id = v_maker_user_id AND currency_id = v_base_currency_id;

    UPDATE wallets SET frozen = GREATEST(0, frozen - p_amount), updated_at = NOW(6)
    WHERE user_id = v_taker_user_id AND currency_id = v_base_currency_id;

    UPDATE wallets SET available = available + v_quote_delta - p_taker_fee, updated_at = NOW(6)
    WHERE user_id = v_taker_user_id AND currency_id = v_quote_currency_id;
  END IF;

  SELECT wallet_id, (available + frozen)
  INTO v_maker_base_wallet_id, v_maker_base_balance_after
  FROM wallets
  WHERE user_id = v_maker_user_id AND currency_id = v_base_currency_id
  LIMIT 1;

  SELECT wallet_id, (available + frozen)
  INTO v_maker_quote_wallet_id, v_maker_quote_balance_after
  FROM wallets
  WHERE user_id = v_maker_user_id AND currency_id = v_quote_currency_id
  LIMIT 1;

  SELECT wallet_id, (available + frozen)
  INTO v_taker_base_wallet_id, v_taker_base_balance_after
  FROM wallets
  WHERE user_id = v_taker_user_id AND currency_id = v_base_currency_id
  LIMIT 1;

  SELECT wallet_id, (available + frozen)
  INTO v_taker_quote_wallet_id, v_taker_quote_balance_after
  FROM wallets
  WHERE user_id = v_taker_user_id AND currency_id = v_quote_currency_id
  LIMIT 1;

  IF v_maker_base_wallet_id IS NULL OR v_maker_quote_wallet_id IS NULL OR v_taker_base_wallet_id IS NULL OR v_taker_quote_wallet_id IS NULL THEN
    SET p_error_code = 'WALLET_NOT_FOUND';
    SET p_error_message = 'Trade settlement wallet not found';
    ROLLBACK;
    LEAVE proc_label;
  END IF;

  IF v_maker_side = 'SELL' THEN
    INSERT INTO wallet_ledger (ledger_id, user_id, currency_id, wallet_id, ref_type, ref_id, direction, amount, balance_after)
    VALUES
      (UUID(), v_maker_user_id, v_base_currency_id, v_maker_base_wallet_id, 'TRADE', v_trade_id, 'DEBIT', p_amount, v_maker_base_balance_after),
      (UUID(), v_maker_user_id, v_quote_currency_id, v_maker_quote_wallet_id, 'TRADE', v_trade_id, 'CREDIT', (v_quote_delta - p_maker_fee), v_maker_quote_balance_after),
      (UUID(), v_taker_user_id, v_quote_currency_id, v_taker_quote_wallet_id, 'TRADE', v_trade_id, 'DEBIT', v_quote_delta, v_taker_quote_balance_after),
      (UUID(), v_taker_user_id, v_base_currency_id, v_taker_base_wallet_id, 'TRADE', v_trade_id, 'CREDIT', (p_amount - p_taker_fee), v_taker_base_balance_after);
  ELSE
    INSERT INTO wallet_ledger (ledger_id, user_id, currency_id, wallet_id, ref_type, ref_id, direction, amount, balance_after)
    VALUES
      (UUID(), v_maker_user_id, v_quote_currency_id, v_maker_quote_wallet_id, 'TRADE', v_trade_id, 'DEBIT', v_quote_delta, v_maker_quote_balance_after),
      (UUID(), v_maker_user_id, v_base_currency_id, v_maker_base_wallet_id, 'TRADE', v_trade_id, 'CREDIT', (p_amount - p_maker_fee), v_maker_base_balance_after),
      (UUID(), v_taker_user_id, v_base_currency_id, v_taker_base_wallet_id, 'TRADE', v_trade_id, 'DEBIT', p_amount, v_taker_base_balance_after),
      (UUID(), v_taker_user_id, v_quote_currency_id, v_taker_quote_wallet_id, 'TRADE', v_trade_id, 'CREDIT', (v_quote_delta - p_taker_fee), v_taker_quote_balance_after);
  END IF;

  COMMIT;
  SET p_trade_id = v_trade_id;
END;
`;
    await runProcedureSql(queryRunner, spTradeExecute);

    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_orders_open_for_pair');
    const spOrdersOpen = `
CREATE PROCEDURE sp_orders_open_for_pair(
  IN p_pair_id CHAR(36),
  IN p_side VARCHAR(4)
)
READS SQL DATA
BEGIN
  IF p_side = 'BUY' THEN
    SELECT order_id, user_id, pair_id, side, type, price, amount, filled_amount, avg_price,
           status, time_in_force, reserved_quote, reserved_base, client_order_id, idempotency_key,
           slippage_tolerance, created_at, updated_at
    FROM orders
    WHERE pair_id = p_pair_id AND side = 'BUY' AND status IN ('OPEN', 'PARTIAL')
    ORDER BY price DESC, created_at ASC;
  ELSE
    SELECT order_id, user_id, pair_id, side, type, price, amount, filled_amount, avg_price,
           status, time_in_force, reserved_quote, reserved_base, client_order_id, idempotency_key,
           slippage_tolerance, created_at, updated_at
    FROM orders
    WHERE pair_id = p_pair_id AND side = 'SELL' AND status IN ('OPEN', 'PARTIAL')
    ORDER BY price ASC, created_at ASC;
  END IF;
END;
`;
    await runProcedureSql(queryRunner, spOrdersOpen);

    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_order_find_by_id');
    await queryRunner.query(`
      CREATE PROCEDURE sp_order_find_by_id(IN p_order_id CHAR(36))
      READS SQL DATA
      BEGIN
        SELECT order_id, user_id, pair_id, side, type, price, amount, filled_amount, avg_price,
               status, time_in_force, reserved_quote, reserved_base, client_order_id, idempotency_key,
               slippage_tolerance, created_at, updated_at
        FROM orders WHERE order_id = p_order_id LIMIT 1;
      END;
    `);

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
               slippage_tolerance, created_at, updated_at
        FROM orders
        WHERE user_id = p_user_id AND idempotency_key = p_idempotency_key
        LIMIT 1;
      END;
    `);

    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_order_find_by_user');
    await queryRunner.query(`
      CREATE PROCEDURE sp_order_find_by_user(
        IN p_user_id CHAR(36),
        IN p_status VARCHAR(32),
        IN p_skip INT,
        IN p_limit INT
      )
      READS SQL DATA
      BEGIN
        IF p_status IS NULL OR p_status = '' THEN
          SELECT order_id, user_id, pair_id, side, type, price, amount, filled_amount, avg_price,
                 status, time_in_force, reserved_quote, reserved_base, client_order_id, idempotency_key,
                 slippage_tolerance, created_at, updated_at
          FROM orders WHERE user_id = p_user_id
          ORDER BY created_at DESC LIMIT p_skip, p_limit;
        ELSE
          SELECT order_id, user_id, pair_id, side, type, price, amount, filled_amount, avg_price,
                 status, time_in_force, reserved_quote, reserved_base, client_order_id, idempotency_key,
                 slippage_tolerance, created_at, updated_at
          FROM orders WHERE user_id = p_user_id AND status = p_status
          ORDER BY created_at DESC LIMIT p_skip, p_limit;
        END IF;
      END;
    `);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    throw new Error(
      'MatchingEngineHardening1775510000000: down() not supported. Restore from backup, or manually DROP COLUMN orders.slippage_tolerance and recreate sp_order_create (see migration 177550), sp_trade_execute (177545), sp_orders_open_for_pair + sp_order_find_* (177400/1768228000000 bodies).',
    );
  }
}
