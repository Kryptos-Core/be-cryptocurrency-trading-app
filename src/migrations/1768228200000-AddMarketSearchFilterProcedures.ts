import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add stored procedures for market list with search and filter.
 * Repository Pattern + Database Procedure Pattern: search/filter logic in DB layer.
 * - sp_market_find_all_filtered: paginated list with optional search (symbol LIKE) and base/quote filters
 * - sp_market_count_filtered: total count with same filters
 */
export class AddMarketSearchFilterProcedures1768228200000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ----- sp_market_find_all_filtered -----
    // p_search: partial match on mp.symbol (e.g. "BTC" -> symbol LIKE '%BTC%')
    // p_base_symbol: filter by base currency symbol (e.g. "BTC"); NULL = no filter
    // p_quote_symbol: filter by quote currency symbol (e.g. "USDT"); NULL = no filter
    await queryRunner.query(`DROP PROCEDURE IF EXISTS sp_market_find_all_filtered`);
    await queryRunner.query(`
      CREATE PROCEDURE sp_market_find_all_filtered(
        IN p_skip INT,
        IN p_limit INT,
        IN p_include_inactive BOOLEAN,
        IN p_search VARCHAR(64),
        IN p_base_symbol VARCHAR(16),
        IN p_quote_symbol VARCHAR(16)
      )
      BEGIN
        IF (p_include_inactive IS NULL) THEN SET p_include_inactive = 0; END IF;
        IF (p_search IS NOT NULL AND TRIM(p_search) != '') THEN SET p_search = UPPER(TRIM(p_search)); END IF;
        IF (p_base_symbol IS NOT NULL AND TRIM(p_base_symbol) != '') THEN SET p_base_symbol = UPPER(TRIM(p_base_symbol)); END IF;
        IF (p_quote_symbol IS NOT NULL AND TRIM(p_quote_symbol) != '') THEN SET p_quote_symbol = UPPER(TRIM(p_quote_symbol)); END IF;

        SELECT
          mp.pair_id, mp.base_currency_id, mp.quote_currency_id, mp.symbol,
          mp.price_scale, mp.amount_scale, mp.min_order_amount,
          mp.maker_fee_rate, mp.taker_fee_rate, mp.is_active, mp.created_at,
          bc.symbol AS base_currency_symbol, bc.name AS base_currency_name,
          qc.symbol AS quote_currency_symbol, qc.name AS quote_currency_name
        FROM market_pairs mp
        INNER JOIN currencies bc ON mp.base_currency_id = bc.currency_id
        INNER JOIN currencies qc ON mp.quote_currency_id = qc.currency_id
        WHERE
          (p_include_inactive OR mp.is_active = 1)
          AND (p_search IS NULL OR p_search = '' OR mp.symbol LIKE CONCAT('%', p_search, '%'))
          AND (p_base_symbol IS NULL OR p_base_symbol = '' OR bc.symbol = p_base_symbol)
          AND (p_quote_symbol IS NULL OR p_quote_symbol = '' OR qc.symbol = p_quote_symbol)
        ORDER BY mp.symbol ASC
        LIMIT p_skip, p_limit;
      END;
    `);

    // ----- sp_market_count_filtered -----
    await queryRunner.query(`DROP PROCEDURE IF EXISTS sp_market_count_filtered`);
    await queryRunner.query(`
      CREATE PROCEDURE sp_market_count_filtered(
        IN p_include_inactive BOOLEAN,
        IN p_search VARCHAR(64),
        IN p_base_symbol VARCHAR(16),
        IN p_quote_symbol VARCHAR(16),
        OUT p_total INT
      )
      BEGIN
        IF (p_include_inactive IS NULL) THEN SET p_include_inactive = 0; END IF;
        IF (p_search IS NOT NULL AND TRIM(p_search) != '') THEN SET p_search = UPPER(TRIM(p_search)); END IF;
        IF (p_base_symbol IS NOT NULL AND TRIM(p_base_symbol) != '') THEN SET p_base_symbol = UPPER(TRIM(p_base_symbol)); END IF;
        IF (p_quote_symbol IS NOT NULL AND TRIM(p_quote_symbol) != '') THEN SET p_quote_symbol = UPPER(TRIM(p_quote_symbol)); END IF;

        SELECT COUNT(*) INTO p_total
        FROM market_pairs mp
        INNER JOIN currencies bc ON mp.base_currency_id = bc.currency_id
        INNER JOIN currencies qc ON mp.quote_currency_id = qc.currency_id
        WHERE
          (p_include_inactive OR mp.is_active = 1)
          AND (p_search IS NULL OR p_search = '' OR mp.symbol LIKE CONCAT('%', p_search, '%'))
          AND (p_base_symbol IS NULL OR p_base_symbol = '' OR bc.symbol = p_base_symbol)
          AND (p_quote_symbol IS NULL OR p_quote_symbol = '' OR qc.symbol = p_quote_symbol);
      END;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP PROCEDURE IF EXISTS sp_market_count_filtered`);
    await queryRunner.query(`DROP PROCEDURE IF EXISTS sp_market_find_all_filtered`);
  }
}
