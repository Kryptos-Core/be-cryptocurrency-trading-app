import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add advanced market list/count legacy MySQL legacy MySQL stored procedures.
 * Repository Pattern + Legacy database-procedure pattern: advanced query logic in DB layer.
 */
export class AddAdvancedMarketListProcedures1773800100000 implements MigrationInterface {
  name = 'AddAdvancedMarketListProcedures1773800100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_market_find_all_advanced');
    await queryRunner.query(`
      CREATE PROCEDURE sp_market_find_all_advanced(
        IN p_skip INT,
        IN p_limit INT,
        IN p_include_inactive BOOLEAN,
        IN p_search VARCHAR(64),
        IN p_base_symbol VARCHAR(16),
        IN p_quote_symbol VARCHAR(16),
        IN p_quote_symbols_csv VARCHAR(255),
        IN p_sort_by VARCHAR(32),
        IN p_sort_order VARCHAR(8),
        IN p_fuzzy_search BOOLEAN
      )
      READS SQL DATA
      BEGIN
        IF (p_skip IS NULL OR p_skip < 0) THEN SET p_skip = 0; END IF;
        IF (p_limit IS NULL OR p_limit < 1) THEN SET p_limit = 10; END IF;
        IF (p_include_inactive IS NULL) THEN SET p_include_inactive = 0; END IF;
        IF (p_fuzzy_search IS NULL) THEN SET p_fuzzy_search = 0; END IF;

        IF (p_search IS NOT NULL AND TRIM(p_search) != '') THEN
          SET p_search = UPPER(TRIM(p_search));
        ELSE
          SET p_search = NULL;
        END IF;

        IF (p_base_symbol IS NOT NULL AND TRIM(p_base_symbol) != '') THEN
          SET p_base_symbol = UPPER(TRIM(p_base_symbol));
        ELSE
          SET p_base_symbol = NULL;
        END IF;

        IF (p_quote_symbol IS NOT NULL AND TRIM(p_quote_symbol) != '') THEN
          SET p_quote_symbol = UPPER(TRIM(p_quote_symbol));
        ELSE
          SET p_quote_symbol = NULL;
        END IF;

        IF (p_quote_symbols_csv IS NOT NULL AND TRIM(p_quote_symbols_csv) != '') THEN
          SET p_quote_symbols_csv = UPPER(REPLACE(TRIM(p_quote_symbols_csv), ' ', ''));
        ELSE
          SET p_quote_symbols_csv = NULL;
        END IF;

        IF (p_sort_by IS NOT NULL AND TRIM(p_sort_by) != '') THEN
          SET p_sort_by = LOWER(TRIM(p_sort_by));
        ELSE
          SET p_sort_by = 'symbol';
        END IF;

        IF (p_sort_by NOT IN ('symbol', 'base', 'quote', 'createdat')) THEN
          SET p_sort_by = 'symbol';
        END IF;

        IF (p_sort_order IS NOT NULL AND TRIM(p_sort_order) != '') THEN
          SET p_sort_order = LOWER(TRIM(p_sort_order));
        ELSE
          SET p_sort_order = 'asc';
        END IF;

        IF (p_sort_order NOT IN ('asc', 'desc')) THEN
          SET p_sort_order = 'asc';
        END IF;

        SELECT
          mp.pair_id,
          mp.base_currency_id,
          mp.quote_currency_id,
          mp.symbol,
          mp.price_scale,
          mp.amount_scale,
          mp.min_order_amount,
          mp.maker_fee_rate,
          mp.taker_fee_rate,
          mp.is_active,
          mp.created_at,
          bc.symbol AS base_currency_symbol,
          bc.name AS base_currency_name,
          qc.symbol AS quote_currency_symbol,
          qc.name AS quote_currency_name
        FROM market_pairs mp
        INNER JOIN currencies bc ON mp.base_currency_id = bc.currency_id
        INNER JOIN currencies qc ON mp.quote_currency_id = qc.currency_id
        WHERE
          (p_include_inactive OR mp.is_active = 1)
          AND (p_base_symbol IS NULL OR UPPER(bc.symbol) = p_base_symbol)
          AND (p_quote_symbol IS NULL OR UPPER(qc.symbol) = p_quote_symbol)
          AND (
            p_quote_symbols_csv IS NULL
            OR FIND_IN_SET(UPPER(qc.symbol), p_quote_symbols_csv) > 0
          )
          AND (
            p_search IS NULL
            OR UPPER(mp.symbol) LIKE CONCAT('%', p_search, '%')
            OR UPPER(bc.symbol) LIKE CONCAT('%', p_search, '%')
            OR UPPER(qc.symbol) LIKE CONCAT('%', p_search, '%')
            OR (p_fuzzy_search = 1 AND UPPER(bc.name) LIKE CONCAT('%', p_search, '%'))
            OR (p_fuzzy_search = 1 AND UPPER(qc.name) LIKE CONCAT('%', p_search, '%'))
          )
        ORDER BY
          CASE
            WHEN p_sort_by = 'symbol' AND p_sort_order = 'asc' THEN mp.symbol
          END ASC,
          CASE
            WHEN p_sort_by = 'symbol' AND p_sort_order = 'desc' THEN mp.symbol
          END DESC,
          CASE
            WHEN p_sort_by = 'base' AND p_sort_order = 'asc' THEN bc.symbol
          END ASC,
          CASE
            WHEN p_sort_by = 'base' AND p_sort_order = 'desc' THEN bc.symbol
          END DESC,
          CASE
            WHEN p_sort_by = 'quote' AND p_sort_order = 'asc' THEN qc.symbol
          END ASC,
          CASE
            WHEN p_sort_by = 'quote' AND p_sort_order = 'desc' THEN qc.symbol
          END DESC,
          CASE
            WHEN p_sort_by = 'createdat' AND p_sort_order = 'asc' THEN mp.created_at
          END ASC,
          CASE
            WHEN p_sort_by = 'createdat' AND p_sort_order = 'desc' THEN mp.created_at
          END DESC,
          mp.symbol ASC
        LIMIT p_skip, p_limit;
      END
    `);

    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_market_count_advanced');
    await queryRunner.query(`
      CREATE PROCEDURE sp_market_count_advanced(
        IN p_include_inactive BOOLEAN,
        IN p_search VARCHAR(64),
        IN p_base_symbol VARCHAR(16),
        IN p_quote_symbol VARCHAR(16),
        IN p_quote_symbols_csv VARCHAR(255),
        IN p_fuzzy_search BOOLEAN,
        OUT p_total INT
      )
      READS SQL DATA
      BEGIN
        IF (p_include_inactive IS NULL) THEN SET p_include_inactive = 0; END IF;
        IF (p_fuzzy_search IS NULL) THEN SET p_fuzzy_search = 0; END IF;

        IF (p_search IS NOT NULL AND TRIM(p_search) != '') THEN
          SET p_search = UPPER(TRIM(p_search));
        ELSE
          SET p_search = NULL;
        END IF;

        IF (p_base_symbol IS NOT NULL AND TRIM(p_base_symbol) != '') THEN
          SET p_base_symbol = UPPER(TRIM(p_base_symbol));
        ELSE
          SET p_base_symbol = NULL;
        END IF;

        IF (p_quote_symbol IS NOT NULL AND TRIM(p_quote_symbol) != '') THEN
          SET p_quote_symbol = UPPER(TRIM(p_quote_symbol));
        ELSE
          SET p_quote_symbol = NULL;
        END IF;

        IF (p_quote_symbols_csv IS NOT NULL AND TRIM(p_quote_symbols_csv) != '') THEN
          SET p_quote_symbols_csv = UPPER(REPLACE(TRIM(p_quote_symbols_csv), ' ', ''));
        ELSE
          SET p_quote_symbols_csv = NULL;
        END IF;

        SELECT COUNT(*) INTO p_total
        FROM market_pairs mp
        INNER JOIN currencies bc ON mp.base_currency_id = bc.currency_id
        INNER JOIN currencies qc ON mp.quote_currency_id = qc.currency_id
        WHERE
          (p_include_inactive OR mp.is_active = 1)
          AND (p_base_symbol IS NULL OR UPPER(bc.symbol) = p_base_symbol)
          AND (p_quote_symbol IS NULL OR UPPER(qc.symbol) = p_quote_symbol)
          AND (
            p_quote_symbols_csv IS NULL
            OR FIND_IN_SET(UPPER(qc.symbol), p_quote_symbols_csv) > 0
          )
          AND (
            p_search IS NULL
            OR UPPER(mp.symbol) LIKE CONCAT('%', p_search, '%')
            OR UPPER(bc.symbol) LIKE CONCAT('%', p_search, '%')
            OR UPPER(qc.symbol) LIKE CONCAT('%', p_search, '%')
            OR (p_fuzzy_search = 1 AND UPPER(bc.name) LIKE CONCAT('%', p_search, '%'))
            OR (p_fuzzy_search = 1 AND UPPER(qc.name) LIKE CONCAT('%', p_search, '%'))
          );
      END
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_market_count_advanced');
    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_market_find_all_advanced');
  }
}
