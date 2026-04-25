import type { MigrationInterface, QueryRunner } from 'typeorm';
import { runProcedureSql } from './helpers/raw-procedure-connection.util';

/**
 * Migration: Stored procedures for Matching Engine
 * - sp_orders_open_for_pair: load OPEN/PARTIAL orders for order book
 * - sp_trade_execute: atomic trade execution (insert trade, update orders, update wallets)
 */
export class CreateMatchingProcedures1768227200000 implements MigrationInterface {
  private isPostgres(queryRunner: QueryRunner): boolean {
    return queryRunner.connection.options.type === 'postgres';
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (this.isPostgres(queryRunner)) {
      return;
    }
    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_orders_open_for_pair');
    const spOrdersOpen = `
CREATE PROCEDURE sp_orders_open_for_pair(
  IN p_pair_id INT,
  IN p_side VARCHAR(4)
)
READS SQL DATA
BEGIN
  IF p_side = 'BUY' THEN
    SELECT order_id, user_id, pair_id, side, type, price, amount, filled_amount, avg_price,
           status, time_in_force, reserved_quote, reserved_base, client_order_id, idempotency_key, created_at, updated_at
    FROM orders
    WHERE pair_id = p_pair_id AND side = 'BUY' AND status IN ('OPEN', 'PARTIAL')
    ORDER BY price DESC, created_at ASC;
  ELSE
    SELECT order_id, user_id, pair_id, side, type, price, amount, filled_amount, avg_price,
           status, time_in_force, reserved_quote, reserved_base, client_order_id, idempotency_key, created_at, updated_at
    FROM orders
    WHERE pair_id = p_pair_id AND side = 'SELL' AND status IN ('OPEN', 'PARTIAL')
    ORDER BY price ASC, created_at ASC;
  END IF;
END;
`;
    await runProcedureSql(queryRunner, spOrdersOpen);

    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_trade_execute');
    const spTradeExecute = `
CREATE PROCEDURE sp_trade_execute(
  IN p_pair_id INT,
  IN p_maker_order_id BIGINT,
  IN p_taker_order_id BIGINT,
  IN p_price DECIMAL(36,18),
  IN p_amount DECIMAL(36,18),
  IN p_fee_currency_id INT,
  IN p_taker_fee DECIMAL(36,18),
  IN p_maker_fee DECIMAL(36,18),
  OUT p_trade_id BIGINT,
  OUT p_error_code VARCHAR(32),
  OUT p_error_message VARCHAR(255)
)
MODIFIES SQL DATA
proc_label: BEGIN
  DECLARE v_maker_user_id BIGINT DEFAULT NULL;
  DECLARE v_taker_user_id BIGINT DEFAULT NULL;
  DECLARE v_maker_side VARCHAR(4) DEFAULT NULL;
  DECLARE v_base_currency_id INT DEFAULT NULL;
  DECLARE v_quote_currency_id INT DEFAULT NULL;
  DECLARE v_maker_filled DECIMAL(36,18) DEFAULT NULL;
  DECLARE v_taker_filled DECIMAL(36,18) DEFAULT NULL;
  DECLARE v_maker_amount DECIMAL(36,18) DEFAULT NULL;
  DECLARE v_taker_amount DECIMAL(36,18) DEFAULT NULL;
  DECLARE v_quote_delta DECIMAL(36,18) DEFAULT NULL;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  SET p_trade_id = NULL;
  SET p_error_code = NULL;
  SET p_error_message = NULL;
  SET v_quote_delta = p_amount * p_price;

  START TRANSACTION;

  SELECT user_id, side, filled_amount, amount INTO v_maker_user_id, v_maker_side, v_maker_filled, v_maker_amount
  FROM orders WHERE order_id = p_maker_order_id FOR UPDATE;

  SELECT user_id, filled_amount, amount INTO v_taker_user_id, v_taker_filled, v_taker_amount
  FROM orders WHERE order_id = p_taker_order_id FOR UPDATE;

  IF v_maker_user_id IS NULL OR v_taker_user_id IS NULL THEN
    SET p_error_code = 'ORDER_NOT_FOUND';
    SET p_error_message = 'Maker or taker order not found';
    LEAVE proc_label;
  END IF;

  SELECT base_currency_id, quote_currency_id INTO v_base_currency_id, v_quote_currency_id
  FROM market_pairs WHERE pair_id = p_pair_id LIMIT 1;

  INSERT INTO trades (pair_id, taker_order_id, maker_order_id, price, amount, taker_fee, maker_fee, fee_currency_id, created_at)
  VALUES (p_pair_id, p_taker_order_id, p_maker_order_id, p_price, p_amount, p_taker_fee, p_maker_fee, p_fee_currency_id, NOW(6));
  SET p_trade_id = LAST_INSERT_ID();

  UPDATE orders SET
    filled_amount = filled_amount + p_amount,
    avg_price = (COALESCE(avg_price, 0) * filled_amount + p_price * p_amount) / (filled_amount + p_amount),
    status = IF((amount - filled_amount - p_amount) <= 0, 'FILLED', 'PARTIAL'),
    reserved_quote = IF(side = 'BUY', GREATEST(0, reserved_quote - v_quote_delta), reserved_quote),
    reserved_base = IF(side = 'SELL', GREATEST(0, reserved_base - p_amount), reserved_base),
    updated_at = NOW(6)
  WHERE order_id = p_maker_order_id;

  UPDATE orders SET
    filled_amount = filled_amount + p_amount,
    avg_price = (COALESCE(avg_price, 0) * filled_amount + p_price * p_amount) / (filled_amount + p_amount),
    status = IF((amount - filled_amount - p_amount) <= 0, 'FILLED', 'PARTIAL'),
    reserved_quote = IF(side = 'BUY', GREATEST(0, reserved_quote - v_quote_delta), reserved_quote),
    reserved_base = IF(side = 'SELL', GREATEST(0, reserved_base - p_amount), reserved_base),
    updated_at = NOW(6)
  WHERE order_id = p_taker_order_id;

  IF v_maker_side = 'SELL' THEN
    UPDATE wallets SET frozen = frozen - p_amount, updated_at = NOW(6)
    WHERE user_id = v_maker_user_id AND currency_id = v_base_currency_id;
    UPDATE wallets SET available = available + v_quote_delta - p_maker_fee, updated_at = NOW(6)
    WHERE user_id = v_maker_user_id AND currency_id = v_quote_currency_id;
    UPDATE wallets SET frozen = frozen - v_quote_delta, updated_at = NOW(6)
    WHERE user_id = v_taker_user_id AND currency_id = v_quote_currency_id;
    UPDATE wallets SET available = available + p_amount - p_taker_fee, updated_at = NOW(6)
    WHERE user_id = v_taker_user_id AND currency_id = v_base_currency_id;
  ELSE
    UPDATE wallets SET frozen = frozen - v_quote_delta, updated_at = NOW(6)
    WHERE user_id = v_maker_user_id AND currency_id = v_quote_currency_id;
    UPDATE wallets SET available = available + p_amount - p_maker_fee, updated_at = NOW(6)
    WHERE user_id = v_maker_user_id AND currency_id = v_base_currency_id;
    UPDATE wallets SET frozen = frozen - p_amount, updated_at = NOW(6)
    WHERE user_id = v_taker_user_id AND currency_id = v_base_currency_id;
    UPDATE wallets SET available = available + v_quote_delta - p_taker_fee, updated_at = NOW(6)
    WHERE user_id = v_taker_user_id AND currency_id = v_quote_currency_id;
  END IF;

  COMMIT;
END;
`;
    await runProcedureSql(queryRunner, spTradeExecute);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (this.isPostgres(queryRunner)) {
      return;
    }
    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_trade_execute');
    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_orders_open_for_pair');
  }
}
