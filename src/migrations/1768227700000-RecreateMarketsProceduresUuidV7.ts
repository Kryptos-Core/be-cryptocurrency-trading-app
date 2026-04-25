import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Recreate market legacy MySQL legacy MySQL stored procedures for UUID v7 schema.
 * All ID parameters use CHAR(36). Run after 1768227600000-ConvertAllIdsToUuidV7.
 */
export class RecreateMarketsProceduresUuidV71768227700000 implements MigrationInterface {
  private isPostgres(queryRunner: QueryRunner): boolean {
    return queryRunner.connection.options.type === 'postgres';
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (this.isPostgres(queryRunner)) {
      return;
    }
    // ----- sp_market_find_by_id (p_pair_id CHAR(36)) -----
    await queryRunner.query(`DROP PROCEDURE IF EXISTS sp_market_find_by_id`);
    await queryRunner.query(`
      CREATE PROCEDURE sp_market_find_by_id(IN p_pair_id CHAR(36))
      BEGIN
        SELECT
          mp.pair_id, mp.base_currency_id, mp.quote_currency_id, mp.symbol,
          mp.price_scale, mp.amount_scale, mp.min_order_amount,
          mp.maker_fee_rate, mp.taker_fee_rate, mp.is_active, mp.created_at,
          bc.symbol AS base_currency_symbol, bc.name AS base_currency_name,
          qc.symbol AS quote_currency_symbol, qc.name AS quote_currency_name
        FROM market_pairs mp
        INNER JOIN currencies bc ON mp.base_currency_id = bc.currency_id
        INNER JOIN currencies qc ON mp.quote_currency_id = qc.currency_id
        WHERE mp.pair_id = p_pair_id
        LIMIT 1;
      END;
    `);

    // ----- sp_market_find_by_symbol (unchanged) -----
    await queryRunner.query(`DROP PROCEDURE IF EXISTS sp_market_find_by_symbol`);
    await queryRunner.query(`
      CREATE PROCEDURE sp_market_find_by_symbol(IN p_symbol VARCHAR(32))
      BEGIN
        SELECT
          mp.pair_id, mp.base_currency_id, mp.quote_currency_id, mp.symbol,
          mp.price_scale, mp.amount_scale, mp.min_order_amount,
          mp.maker_fee_rate, mp.taker_fee_rate, mp.is_active, mp.created_at,
          bc.symbol AS base_currency_symbol, bc.name AS base_currency_name,
          qc.symbol AS quote_currency_symbol, qc.name AS quote_currency_name
        FROM market_pairs mp
        INNER JOIN currencies bc ON mp.base_currency_id = bc.currency_id
        INNER JOIN currencies qc ON mp.quote_currency_id = qc.currency_id
        WHERE mp.symbol = UPPER(p_symbol)
        LIMIT 1;
      END;
    `);

    // ----- sp_market_find_all (unchanged) -----
    await queryRunner.query(`DROP PROCEDURE IF EXISTS sp_market_find_all`);
    await queryRunner.query(`
      CREATE PROCEDURE sp_market_find_all(IN p_skip INT, IN p_limit INT, IN p_include_inactive BOOLEAN)
      BEGIN
        IF p_include_inactive THEN
          SELECT mp.pair_id, mp.base_currency_id, mp.quote_currency_id, mp.symbol,
            mp.price_scale, mp.amount_scale, mp.min_order_amount,
            mp.maker_fee_rate, mp.taker_fee_rate, mp.is_active, mp.created_at,
            bc.symbol AS base_currency_symbol, bc.name AS base_currency_name,
            qc.symbol AS quote_currency_symbol, qc.name AS quote_currency_name
          FROM market_pairs mp
          INNER JOIN currencies bc ON mp.base_currency_id = bc.currency_id
          INNER JOIN currencies qc ON mp.quote_currency_id = qc.currency_id
          ORDER BY mp.symbol ASC LIMIT p_skip, p_limit;
        ELSE
          SELECT mp.pair_id, mp.base_currency_id, mp.quote_currency_id, mp.symbol,
            mp.price_scale, mp.amount_scale, mp.min_order_amount,
            mp.maker_fee_rate, mp.taker_fee_rate, mp.is_active, mp.created_at,
            bc.symbol AS base_currency_symbol, bc.name AS base_currency_name,
            qc.symbol AS quote_currency_symbol, qc.name AS quote_currency_name
          FROM market_pairs mp
          INNER JOIN currencies bc ON mp.base_currency_id = bc.currency_id
          INNER JOIN currencies qc ON mp.quote_currency_id = qc.currency_id
          WHERE mp.is_active = 1 ORDER BY mp.symbol ASC LIMIT p_skip, p_limit;
        END IF;
      END;
    `);

    // ----- sp_market_count (unchanged) -----
    await queryRunner.query(`DROP PROCEDURE IF EXISTS sp_market_count`);
    await queryRunner.query(`
      CREATE PROCEDURE sp_market_count(IN p_include_inactive BOOLEAN, OUT p_total INT)
      BEGIN
        IF p_include_inactive THEN
          SELECT COUNT(*) INTO p_total FROM market_pairs;
        ELSE
          SELECT COUNT(*) INTO p_total FROM market_pairs WHERE is_active = 1;
        END IF;
      END;
    `);

    // ----- sp_market_create: IN p_pair_id CHAR(36), no OUT -----
    await queryRunner.query(`DROP PROCEDURE IF EXISTS sp_market_create`);
    await queryRunner.query(`
      CREATE PROCEDURE sp_market_create(
        IN p_pair_id CHAR(36),
        IN p_base_currency_id CHAR(36),
        IN p_quote_currency_id CHAR(36),
        IN p_symbol VARCHAR(32),
        IN p_price_scale TINYINT,
        IN p_amount_scale TINYINT,
        IN p_min_order_amount DECIMAL(36,18),
        IN p_maker_fee_rate DECIMAL(10,8),
        IN p_taker_fee_rate DECIMAL(10,8),
        IN p_is_active TINYINT
      )
      BEGIN
        DECLARE EXIT HANDLER FOR SQLEXCEPTION
        BEGIN ROLLBACK; RESIGNAL; END;

        IF NOT EXISTS (SELECT 1 FROM currencies WHERE currency_id = p_base_currency_id AND is_tradable = 1 AND is_active = 1) THEN
          SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Base currency not found or not tradable';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM currencies WHERE currency_id = p_quote_currency_id AND is_tradable = 1 AND is_active = 1) THEN
          SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Quote currency not found or not tradable';
        END IF;
        IF p_base_currency_id = p_quote_currency_id THEN
          SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Base and quote currencies cannot be the same';
        END IF;
        IF EXISTS (SELECT 1 FROM market_pairs WHERE symbol = UPPER(p_symbol)) THEN
          SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Market pair symbol already exists';
        END IF;
        IF EXISTS (SELECT 1 FROM market_pairs WHERE base_currency_id = p_base_currency_id AND quote_currency_id = p_quote_currency_id) THEN
          SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Market pair with this base/quote combination already exists';
        END IF;

        START TRANSACTION;
        INSERT INTO market_pairs (pair_id, base_currency_id, quote_currency_id, symbol, price_scale, amount_scale, min_order_amount, maker_fee_rate, taker_fee_rate, is_active)
        VALUES (p_pair_id, p_base_currency_id, p_quote_currency_id, UPPER(p_symbol), p_price_scale, p_amount_scale, p_min_order_amount, p_maker_fee_rate, p_taker_fee_rate, IFNULL(p_is_active, 1));
        COMMIT;
      END;
    `);

    // ----- sp_market_update (IDs CHAR(36)) -----
    await queryRunner.query(`DROP PROCEDURE IF EXISTS sp_market_update`);
    await queryRunner.query(`
      CREATE PROCEDURE sp_market_update(
        IN p_pair_id CHAR(36),
        IN p_base_currency_id CHAR(36),
        IN p_quote_currency_id CHAR(36),
        IN p_symbol VARCHAR(32),
        IN p_price_scale TINYINT,
        IN p_amount_scale TINYINT,
        IN p_min_order_amount DECIMAL(36,18),
        IN p_maker_fee_rate DECIMAL(10,8),
        IN p_taker_fee_rate DECIMAL(10,8),
        IN p_is_active TINYINT
      )
      BEGIN
        DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
        IF NOT EXISTS (SELECT 1 FROM market_pairs WHERE pair_id = p_pair_id) THEN
          SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Market pair not found';
        END IF;
        IF p_symbol IS NOT NULL AND p_symbol != '' AND EXISTS (SELECT 1 FROM market_pairs WHERE symbol = UPPER(p_symbol) AND pair_id != p_pair_id) THEN
          SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Market pair symbol already exists';
        END IF;
        IF p_base_currency_id IS NOT NULL AND p_quote_currency_id IS NOT NULL THEN
          IF p_base_currency_id = p_quote_currency_id THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Base and quote currencies cannot be the same';
          END IF;
          IF EXISTS (SELECT 1 FROM market_pairs WHERE base_currency_id = p_base_currency_id AND quote_currency_id = p_quote_currency_id AND pair_id != p_pair_id) THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Market pair with this base/quote combination already exists';
          END IF;
        END IF;
        START TRANSACTION;
        UPDATE market_pairs SET
          base_currency_id = IFNULL(p_base_currency_id, base_currency_id),
          quote_currency_id = IFNULL(p_quote_currency_id, quote_currency_id),
          symbol = IFNULL(UPPER(p_symbol), symbol),
          price_scale = IFNULL(p_price_scale, price_scale),
          amount_scale = IFNULL(p_amount_scale, amount_scale),
          min_order_amount = IFNULL(p_min_order_amount, min_order_amount),
          maker_fee_rate = IFNULL(p_maker_fee_rate, maker_fee_rate),
          taker_fee_rate = IFNULL(p_taker_fee_rate, taker_fee_rate),
          is_active = IFNULL(p_is_active, is_active)
        WHERE pair_id = p_pair_id;
        COMMIT;
      END;
    `);

    // ----- sp_market_delete (p_pair_id CHAR(36)) -----
    await queryRunner.query(`DROP PROCEDURE IF EXISTS sp_market_delete`);
    await queryRunner.query(`
      CREATE PROCEDURE sp_market_delete(IN p_pair_id CHAR(36))
      BEGIN
        DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
        IF NOT EXISTS (SELECT 1 FROM market_pairs WHERE pair_id = p_pair_id) THEN
          SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Market pair not found';
        END IF;
        START TRANSACTION;
        UPDATE market_pairs SET is_active = 0 WHERE pair_id = p_pair_id;
        COMMIT;
      END;
    `);

    // ----- sp_market_symbol_exists (p_exclude_pair_id CHAR(36)) -----
    await queryRunner.query(`DROP PROCEDURE IF EXISTS sp_market_symbol_exists`);
    await queryRunner.query(`
      CREATE PROCEDURE sp_market_symbol_exists(IN p_symbol VARCHAR(32), IN p_exclude_pair_id CHAR(36), OUT p_exists BOOLEAN)
      BEGIN
        IF p_exclude_pair_id IS NOT NULL AND p_exclude_pair_id != '' THEN
          SELECT EXISTS(SELECT 1 FROM market_pairs WHERE symbol = UPPER(p_symbol) AND pair_id != p_exclude_pair_id) INTO p_exists;
        ELSE
          SELECT EXISTS(SELECT 1 FROM market_pairs WHERE symbol = UPPER(p_symbol)) INTO p_exists;
        END IF;
      END;
    `);

    // ----- sp_market_pair_exists (CHAR(36)) -----
    await queryRunner.query(`DROP PROCEDURE IF EXISTS sp_market_pair_exists`);
    await queryRunner.query(`
      CREATE PROCEDURE sp_market_pair_exists(IN p_base_currency_id CHAR(36), IN p_quote_currency_id CHAR(36), IN p_exclude_pair_id CHAR(36), OUT p_exists BOOLEAN)
      BEGIN
        IF p_exclude_pair_id IS NOT NULL AND p_exclude_pair_id != '' THEN
          SELECT EXISTS(SELECT 1 FROM market_pairs WHERE base_currency_id = p_base_currency_id AND quote_currency_id = p_quote_currency_id AND pair_id != p_exclude_pair_id) INTO p_exists;
        ELSE
          SELECT EXISTS(SELECT 1 FROM market_pairs WHERE base_currency_id = p_base_currency_id AND quote_currency_id = p_quote_currency_id) INTO p_exists;
        END IF;
      END;
    `);

    // ----- sp_market_find_active (no params) -----
    await queryRunner.query(`DROP PROCEDURE IF EXISTS sp_market_find_active`);
    await queryRunner.query(`
      CREATE PROCEDURE sp_market_find_active()
      BEGIN
        SELECT mp.pair_id, mp.base_currency_id, mp.quote_currency_id, mp.symbol,
          mp.price_scale, mp.amount_scale, mp.min_order_amount,
          mp.maker_fee_rate, mp.taker_fee_rate, mp.is_active, mp.created_at,
          bc.symbol AS base_currency_symbol, bc.name AS base_currency_name,
          qc.symbol AS quote_currency_symbol, qc.name AS quote_currency_name
        FROM market_pairs mp
        INNER JOIN currencies bc ON mp.base_currency_id = bc.currency_id
        INNER JOIN currencies qc ON mp.quote_currency_id = qc.currency_id
        WHERE mp.is_active = 1
        ORDER BY mp.symbol ASC;
      END;
    `);

    // ----- sp_market_find_by_currencies (CHAR(36)) -----
    await queryRunner.query(`DROP PROCEDURE IF EXISTS sp_market_find_by_currencies`);
    await queryRunner.query(`
      CREATE PROCEDURE sp_market_find_by_currencies(IN p_base_currency_id CHAR(36), IN p_quote_currency_id CHAR(36))
      BEGIN
        SELECT mp.pair_id, mp.base_currency_id, mp.quote_currency_id, mp.symbol,
          mp.price_scale, mp.amount_scale, mp.min_order_amount,
          mp.maker_fee_rate, mp.taker_fee_rate, mp.is_active, mp.created_at,
          bc.symbol AS base_currency_symbol, bc.name AS base_currency_name,
          qc.symbol AS quote_currency_symbol, qc.name AS quote_currency_name
        FROM market_pairs mp
        INNER JOIN currencies bc ON mp.base_currency_id = bc.currency_id
        INNER JOIN currencies qc ON mp.quote_currency_id = qc.currency_id
        WHERE mp.base_currency_id = p_base_currency_id AND mp.quote_currency_id = p_quote_currency_id
        LIMIT 1;
      END;
    `);

    // ----- sp_market_order_book_bids (p_pair_id CHAR(36)) -----
    await queryRunner.query(`DROP PROCEDURE IF EXISTS sp_market_order_book_bids`);
    await queryRunner.query(`
      CREATE PROCEDURE sp_market_order_book_bids(IN p_pair_id CHAR(36), IN p_limit INT)
      BEGIN
        SELECT price, SUM(amount - filled_amount) AS amount, COUNT(*) AS orders
        FROM orders
        WHERE pair_id = p_pair_id AND side = 'BUY' AND status IN ('OPEN', 'PARTIAL') AND price IS NOT NULL
        GROUP BY price ORDER BY price DESC LIMIT p_limit;
      END;
    `);

    // ----- sp_market_order_book_asks (p_pair_id CHAR(36)) -----
    await queryRunner.query(`DROP PROCEDURE IF EXISTS sp_market_order_book_asks`);
    await queryRunner.query(`
      CREATE PROCEDURE sp_market_order_book_asks(IN p_pair_id CHAR(36), IN p_limit INT)
      BEGIN
        SELECT price, SUM(amount - filled_amount) AS amount, COUNT(*) AS orders
        FROM orders
        WHERE pair_id = p_pair_id AND side = 'SELL' AND status IN ('OPEN', 'PARTIAL') AND price IS NOT NULL
        GROUP BY price ORDER BY price ASC LIMIT p_limit;
      END;
    `);

    // ----- sp_market_ticker (p_pair_id CHAR(36)) -----
    await queryRunner.query(`DROP PROCEDURE IF EXISTS sp_market_ticker`);
    await queryRunner.query(`
      CREATE PROCEDURE sp_market_ticker(IN p_pair_id CHAR(36))
      BEGIN
        SELECT
          (SELECT price FROM trades WHERE pair_id = p_pair_id ORDER BY created_at DESC LIMIT 1) AS last_price,
          (SELECT price FROM trades WHERE pair_id = p_pair_id AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) ORDER BY created_at ASC LIMIT 1) AS open_24h,
          (SELECT MAX(price) FROM trades WHERE pair_id = p_pair_id AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)) AS high_24h,
          (SELECT MIN(price) FROM trades WHERE pair_id = p_pair_id AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)) AS low_24h,
          (SELECT COALESCE(SUM(amount), 0) FROM trades WHERE pair_id = p_pair_id AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)) AS volume_24h,
          (SELECT COALESCE(SUM(price * amount), 0) FROM trades WHERE pair_id = p_pair_id AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)) AS quote_volume_24h,
          (SELECT price FROM orders WHERE pair_id = p_pair_id AND side = 'BUY' AND status IN ('OPEN', 'PARTIAL') AND price IS NOT NULL ORDER BY price DESC LIMIT 1) AS best_bid,
          (SELECT price FROM orders WHERE pair_id = p_pair_id AND side = 'SELL' AND status IN ('OPEN', 'PARTIAL') AND price IS NOT NULL ORDER BY price ASC LIMIT 1) AS best_ask;
      END;
    `);

    // ----- sp_market_recent_trades (p_pair_id CHAR(36)) -----
    await queryRunner.query(`DROP PROCEDURE IF EXISTS sp_market_recent_trades`);
    await queryRunner.query(`
      CREATE PROCEDURE sp_market_recent_trades(IN p_pair_id CHAR(36), IN p_limit INT)
      BEGIN
        SELECT trade_id, pair_id, taker_order_id, maker_order_id, price, amount, taker_fee, maker_fee, fee_currency_id, created_at
        FROM trades WHERE pair_id = p_pair_id ORDER BY created_at DESC LIMIT p_limit;
      END;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (this.isPostgres(queryRunner)) {
      return;
    }
    const procedures = [
      'sp_market_recent_trades',
      'sp_market_ticker',
      'sp_market_order_book_asks',
      'sp_market_order_book_bids',
      'sp_market_find_by_currencies',
      'sp_market_find_active',
      'sp_market_pair_exists',
      'sp_market_symbol_exists',
      'sp_market_delete',
      'sp_market_update',
      'sp_market_create',
      'sp_market_count',
      'sp_market_find_all',
      'sp_market_find_by_symbol',
      'sp_market_find_by_id',
    ];
    for (const name of procedures) {
      await queryRunner.query(`DROP PROCEDURE IF EXISTS \`${name}\``);
    }
  }
}
