import type { MigrationInterface, QueryRunner } from 'typeorm';
import { runProcedureSql } from './helpers/raw-procedure-connection.util';

/**
 * Fix status computation in sp_trade_execute so PARTIAL/FILLED is based on pre-update remaining.
 */
export class FixTradeExecuteStatusComputation1774200000000 implements MigrationInterface {
  private isPostgres(queryRunner: QueryRunner): boolean {
    return queryRunner.connection.options.type === 'postgres';
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (this.isPostgres(queryRunner)) {
      return;
    }
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

  SELECT user_id, side, (amount - filled_amount)
  INTO v_maker_user_id, v_maker_side, v_maker_remaining
  FROM orders
  WHERE order_id = p_maker_order_id
  FOR UPDATE;

  SELECT user_id, (amount - filled_amount)
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

  SELECT base_currency_id, quote_currency_id
  INTO v_base_currency_id, v_quote_currency_id
  FROM market_pairs
  WHERE pair_id = p_pair_id
  LIMIT 1;

  IF v_base_currency_id IS NULL OR v_quote_currency_id IS NULL THEN
    SET p_error_code = 'PAIR_NOT_FOUND';
    SET p_error_message = 'Market pair not found';
    ROLLBACK;
    LEAVE proc_label;
  END IF;

  SET v_trade_id = UUID();

  INSERT INTO trades (
    trade_id,
    pair_id,
    taker_order_id,
    maker_order_id,
    price,
    amount,
    taker_fee,
    maker_fee,
    fee_currency_id,
    created_at
  ) VALUES (
    v_trade_id,
    p_pair_id,
    p_taker_order_id,
    p_maker_order_id,
    p_price,
    p_amount,
    p_taker_fee,
    p_maker_fee,
    p_fee_currency_id,
    NOW(6)
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

    UPDATE wallets SET frozen = GREATEST(0, frozen - v_quote_delta), updated_at = NOW(6)
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
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (this.isPostgres(queryRunner)) {
      return;
    }
    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_trade_execute');
  }
}
