import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Add sp_ohlcv_upsert (in case 1768226800000 was already run before upsert was added)
 * Persist realtime OHLC stream to DB so GET /markets/:id/ohlcv returns data.
 */
export class AddOHLCVUpsertProcedure1768226900000 implements MigrationInterface {
  private isPostgres(queryRunner: QueryRunner): boolean {
    return queryRunner.connection.options.type === 'postgres';
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (this.isPostgres(queryRunner)) {
      return;
    }
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
    if (this.isPostgres(queryRunner)) {
      return;
    }
    await queryRunner.query(`
      DROP PROCEDURE IF EXISTS sp_ohlcv_upsert;
    `);
  }
}
