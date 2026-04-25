import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fix sp_order_book: ORDER BY must not use columns outside GROUP BY.
 * Legacy MySQL ONLY_FULL_GROUP_BY: "Expression #2 of ORDER BY clause (created_at) is not in GROUP BY".
 * Order book is aggregated by price; ordering by created_at is invalid after GROUP BY price.
 * - SELL (asks): best ask first = price ASC.
 * - BUY (bids): best bid first = price DESC.
 */
export class FixOrderBookProcedureGroupBy1768227300000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_order_book');
    await queryRunner.query(`
      CREATE PROCEDURE sp_order_book(
        IN p_pair_id INT,
        IN p_side VARCHAR(4),
        IN p_limit INT
      )
      READS SQL DATA
      BEGIN
        SELECT price, SUM(amount - filled_amount) AS remaining, COUNT(*) AS order_count
        FROM orders
        WHERE pair_id = p_pair_id AND side = p_side AND status IN ('OPEN', 'PARTIAL')
        GROUP BY price
        ORDER BY price ASC
        LIMIT p_limit;
      END;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_order_book');
    await queryRunner.query(`
      CREATE PROCEDURE sp_order_book(
        IN p_pair_id INT,
        IN p_side VARCHAR(4),
        IN p_limit INT
      )
      READS SQL DATA
      BEGIN
        SELECT price, SUM(amount - filled_amount) AS remaining, COUNT(*) AS order_count
        FROM orders
        WHERE pair_id = p_pair_id AND side = p_side AND status IN ('OPEN', 'PARTIAL')
        GROUP BY price
        ORDER BY price ASC, created_at ASC
        LIMIT p_limit;
      END;
    `);
  }
}
