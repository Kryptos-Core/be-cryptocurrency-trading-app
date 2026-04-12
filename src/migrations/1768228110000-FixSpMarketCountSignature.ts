import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fix sp_market_count signature: 2 params only (IN p_include_inactive, OUT p_total).
 * Use when DB still has a 4-param version and migration 1768228100000 was already run.
 * Safe to run even if 1768228100000 already fixed it (idempotent DROP + CREATE).
 */
export class FixSpMarketCountSignature1768228110000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
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
  }
}
