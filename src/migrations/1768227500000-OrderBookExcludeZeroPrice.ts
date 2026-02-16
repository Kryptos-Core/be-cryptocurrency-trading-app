import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Order book must not show price 0 or NULL (e.g. MARKET orders).
 * Sổ lệnh chỉ hiển thị lệnh LIMIT có giá > 0; lệnh MARKET (price 0/NULL) không xuất hiện.
 */
export class OrderBookExcludeZeroPrice1768227500000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ----- sp_market_order_book_bids: exclude price <= 0 -----
    await queryRunner.query(`DROP PROCEDURE IF EXISTS sp_market_order_book_bids`);
    await queryRunner.query(`
      CREATE PROCEDURE sp_market_order_book_bids(
        IN p_pair_id INT,
        IN p_limit INT
      )
      BEGIN
        SELECT 
          price,
          SUM(amount - filled_amount) AS amount,
          COUNT(*) AS orders
        FROM orders
        WHERE pair_id = p_pair_id
          AND side = 'BUY'
          AND status IN ('OPEN', 'PARTIAL')
          AND price IS NOT NULL
          AND price > 0
        GROUP BY price
        ORDER BY price DESC
        LIMIT p_limit;
      END;
    `);

    // ----- sp_market_order_book_asks: exclude price <= 0 -----
    await queryRunner.query(`DROP PROCEDURE IF EXISTS sp_market_order_book_asks`);
    await queryRunner.query(`
      CREATE PROCEDURE sp_market_order_book_asks(
        IN p_pair_id INT,
        IN p_limit INT
      )
      BEGIN
        SELECT 
          price,
          SUM(amount - filled_amount) AS amount,
          COUNT(*) AS orders
        FROM orders
        WHERE pair_id = p_pair_id
          AND side = 'SELL'
          AND status IN ('OPEN', 'PARTIAL')
          AND price IS NOT NULL
          AND price > 0
        GROUP BY price
        ORDER BY price ASC
        LIMIT p_limit;
      END;
    `);

    // ----- sp_order_book: exclude price <= 0 (used by orders module) -----
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
          AND price IS NOT NULL AND price > 0
        GROUP BY price
        ORDER BY price ASC
        LIMIT p_limit;
      END;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restore previous version (no price > 0 filter)
    await queryRunner.query(`DROP PROCEDURE IF EXISTS sp_market_order_book_bids`);
    await queryRunner.query(`
      CREATE PROCEDURE sp_market_order_book_bids(
        IN p_pair_id INT,
        IN p_limit INT
      )
      BEGIN
        SELECT 
          price,
          SUM(amount - filled_amount) AS amount,
          COUNT(*) AS orders
        FROM orders
        WHERE pair_id = p_pair_id
          AND side = 'BUY'
          AND status IN ('OPEN', 'PARTIAL')
          AND price IS NOT NULL
        GROUP BY price
        ORDER BY price DESC
        LIMIT p_limit;
      END;
    `);

    await queryRunner.query(`DROP PROCEDURE IF EXISTS sp_market_order_book_asks`);
    await queryRunner.query(`
      CREATE PROCEDURE sp_market_order_book_asks(
        IN p_pair_id INT,
        IN p_limit INT
      )
      BEGIN
        SELECT 
          price,
          SUM(amount - filled_amount) AS amount,
          COUNT(*) AS orders
        FROM orders
        WHERE pair_id = p_pair_id
          AND side = 'SELL'
          AND status IN ('OPEN', 'PARTIAL')
          AND price IS NOT NULL
        GROUP BY price
        ORDER BY price ASC
        LIMIT p_limit;
      END;
    `);

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
}
