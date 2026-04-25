import type { MigrationInterface, QueryRunner } from 'typeorm';

export class ScaffoldTimescaleRetentionPolicies1776640000000 implements MigrationInterface {
  name = 'ScaffoldTimescaleRetentionPolicies1776640000000';

  private isPostgres(queryRunner: QueryRunner): boolean {
    return queryRunner.connection.options.type === 'postgres';
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!this.isPostgres(queryRunner)) {
      return;
    }

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
          PERFORM add_retention_policy(
            'read_market_trades',
            drop_after => INTERVAL '30 days',
            if_not_exists => TRUE
          );
        END IF;
      EXCEPTION
        WHEN undefined_function THEN
          RAISE NOTICE 'timescaledb retention policy unavailable for read_market_trades';
        WHEN OTHERS THEN
          RAISE NOTICE 'timescaledb retention policy skipped for read_market_trades: %', SQLERRM;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
          PERFORM add_retention_policy(
            'read_market_ohlcv',
            drop_after => INTERVAL '180 days',
            if_not_exists => TRUE
          );
        END IF;
      EXCEPTION
        WHEN undefined_function THEN
          RAISE NOTICE 'timescaledb retention policy unavailable for read_market_ohlcv';
        WHEN OTHERS THEN
          RAISE NOTICE 'timescaledb retention policy skipped for read_market_ohlcv: %', SQLERRM;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
          EXECUTE 'ALTER TABLE read_market_trades SET (timescaledb.compress = true)';
          PERFORM add_compression_policy(
            'read_market_trades',
            compress_after => INTERVAL '7 days',
            if_not_exists => TRUE
          );
        END IF;
      EXCEPTION
        WHEN undefined_function THEN
          RAISE NOTICE 'timescaledb compression policy unavailable for read_market_trades';
        WHEN OTHERS THEN
          RAISE NOTICE 'timescaledb compression policy skipped for read_market_trades: %', SQLERRM;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
          EXECUTE 'ALTER TABLE read_market_ohlcv SET (timescaledb.compress = true)';
          PERFORM add_compression_policy(
            'read_market_ohlcv',
            compress_after => INTERVAL '14 days',
            if_not_exists => TRUE
          );
        END IF;
      EXCEPTION
        WHEN undefined_function THEN
          RAISE NOTICE 'timescaledb compression policy unavailable for read_market_ohlcv';
        WHEN OTHERS THEN
          RAISE NOTICE 'timescaledb compression policy skipped for read_market_ohlcv: %', SQLERRM;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!this.isPostgres(queryRunner)) {
      return;
    }

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
          PERFORM remove_retention_policy('read_market_trades', if_exists => TRUE);
          PERFORM remove_retention_policy('read_market_ohlcv', if_exists => TRUE);
          PERFORM remove_compression_policy('read_market_trades', if_exists => TRUE);
          PERFORM remove_compression_policy('read_market_ohlcv', if_exists => TRUE);
        END IF;
      EXCEPTION
        WHEN undefined_function THEN
          RAISE NOTICE 'timescaledb policy removal unavailable';
        WHEN OTHERS THEN
          RAISE NOTICE 'timescaledb policy removal skipped: %', SQLERRM;
      END $$;
    `);
  }
}
