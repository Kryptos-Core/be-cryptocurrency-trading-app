import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Cleanup migration: remove legacy OHLCV procedures if they still exist.
 * Current OHLCV flow is on-demand from Price Oracle and no longer uses DB procedures.
 */
export class DropLegacyOhlcvProcedures1773900000000 implements MigrationInterface {
  private isPostgres(queryRunner: QueryRunner): boolean {
    return queryRunner.connection.options.type === 'postgres';
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (this.isPostgres(queryRunner)) {
      return;
    }
    await queryRunner.query(`DROP PROCEDURE IF EXISTS sp_ohlcv_get_by_pair_interval`);
    await queryRunner.query(`DROP PROCEDURE IF EXISTS sp_ohlcv_upsert`);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Intentionally no-op: these are legacy procedures no longer used by runtime flow.
  }
}
