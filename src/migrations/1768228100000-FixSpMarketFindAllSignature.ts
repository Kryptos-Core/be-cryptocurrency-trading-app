import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fix market stored procedure signatures to match MarketRepository:
 * - sp_market_find_all: 3 params (p_skip, p_limit, p_include_inactive)
 * - sp_market_count: 2 params (IN p_include_inactive, OUT p_total)
 * Use when DB has older/different versions (e.g. 5/4 params).
 * Database Procedure Pattern: contract between Repository and Stored Procedure.
 */
export class FixSpMarketFindAllSignature1768228100000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ----- sp_market_find_all: 3 params -----
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

    // ----- sp_market_count: 2 params (IN p_include_inactive, OUT p_total) -----
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
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP PROCEDURE IF EXISTS sp_market_count`);
    await queryRunner.query(`DROP PROCEDURE IF EXISTS sp_market_find_all`);
  }
}
