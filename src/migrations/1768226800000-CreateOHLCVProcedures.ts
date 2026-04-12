import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Create Stored Procedures for OHLCV
 *
 * Database Procedure Pattern: Data access via stored procedure
 * - sp_ohlcv_get_by_pair_interval: read by pair + interval (TradingView historical)
 * - sp_ohlcv_upsert: insert or update one candle (persist realtime stream to DB)
 */
export class CreateOHLCVProcedures1768226800000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP PROCEDURE IF EXISTS sp_ohlcv_get_by_pair_interval;
    `);

    await queryRunner.query(`
      CREATE PROCEDURE sp_ohlcv_get_by_pair_interval(
        IN p_pair_id INT,
        IN p_interval_sec INT,
        IN p_limit INT
      )
      BEGIN
        SELECT
          pair_id,
          interval_sec,
          open_time,
          \`open\`,
          high,
          low,
          \`close\`,
          volume
        FROM ohlcv
        WHERE pair_id = p_pair_id AND interval_sec = p_interval_sec
        ORDER BY open_time DESC
        LIMIT p_limit;
      END;
    `);

    await queryRunner.query(`
      DROP PROCEDURE IF EXISTS sp_ohlcv_upsert;
    `);

    await queryRunner.query(`
      CREATE PROCEDURE sp_ohlcv_upsert(
        IN p_pair_id INT,
        IN p_interval_sec INT,
        IN p_open_time DATETIME,
        IN p_open DECIMAL(36,18),
        IN p_high DECIMAL(36,18),
        IN p_low DECIMAL(36,18),
        IN p_close DECIMAL(36,18),
        IN p_volume DECIMAL(36,18)
      )
      BEGIN
        INSERT INTO ohlcv (pair_id, interval_sec, open_time, \`open\`, high, low, \`close\`, volume)
        VALUES (p_pair_id, p_interval_sec, p_open_time, p_open, p_high, p_low, p_close, p_volume)
        ON DUPLICATE KEY UPDATE
          high = VALUES(high),
          low = VALUES(low),
          \`close\` = VALUES(\`close\`),
          volume = VALUES(volume);
      END;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP PROCEDURE IF EXISTS sp_ohlcv_upsert;
    `);
    await queryRunner.query(`
      DROP PROCEDURE IF EXISTS sp_ohlcv_get_by_pair_interval;
    `);
  }
}
