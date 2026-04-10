import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Drop OHLCV table and related stored procedures.
 * OHLCV data is now provided on-demand by Price Oracle (Binance); no DB persist.
 */
export class DropOHLCVTable1768227400000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP PROCEDURE IF EXISTS sp_ohlcv_upsert`);
    await queryRunner.query(`DROP PROCEDURE IF EXISTS sp_ohlcv_get_by_pair_interval`);

    await queryRunner.query(`ALTER TABLE \`ohlcv\` DROP FOREIGN KEY \`FK_e3ac86a0caa8709a74c0ed0d081\``);
    await queryRunner.query(`ALTER TABLE \`ohlcv\` DROP FOREIGN KEY \`FK_c3418ff3d769b0524947d394c83\``);
    await queryRunner.query(`DROP INDEX \`idx_ohlcv_time\` ON \`ohlcv\``);
    await queryRunner.query(`DROP TABLE \`ohlcv\``);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`ohlcv\` (\`pair_id\` int NOT NULL, \`interval_sec\` int NOT NULL, \`open_time\` datetime NOT NULL, \`open\` decimal(36,18) NOT NULL, \`high\` decimal(36,18) NOT NULL, \`low\` decimal(36,18) NOT NULL, \`close\` decimal(36,18) NOT NULL, \`volume\` decimal(36,18) NOT NULL, \`pairPairId\` int NULL, INDEX \`idx_ohlcv_time\` (\`open_time\`), PRIMARY KEY (\`pair_id\`, \`interval_sec\`, \`open_time\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`ohlcv\` ADD CONSTRAINT \`FK_e3ac86a0caa8709a74c0ed0d081\` FOREIGN KEY (\`pair_id\`) REFERENCES \`market_pairs\`(\`pair_id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`ohlcv\` ADD CONSTRAINT \`FK_c3418ff3d769b0524947d394c83\` FOREIGN KEY (\`pairPairId\`) REFERENCES \`market_pairs\`(\`pair_id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(`
      CREATE PROCEDURE sp_ohlcv_get_by_pair_interval(
        IN p_pair_id INT,
        IN p_interval_sec INT,
        IN p_limit INT
      )
      BEGIN
        SELECT pair_id, interval_sec, open_time, \`open\`, high, low, \`close\`, volume
        FROM ohlcv
        WHERE pair_id = p_pair_id AND interval_sec = p_interval_sec
        ORDER BY open_time DESC
        LIMIT p_limit;
      END;
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
}
