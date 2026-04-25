import type { MigrationInterface, QueryRunner } from 'typeorm';

export class ScaffoldTimescaleReadModel1776630000000 implements MigrationInterface {
  name = 'ScaffoldTimescaleReadModel1776630000000';

  private isPostgres(queryRunner: QueryRunner): boolean {
    return queryRunner.connection.options.type === 'postgres';
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!this.isPostgres(queryRunner)) {
      return;
    }

    await queryRunner.query(`
      CREATE EXTENSION IF NOT EXISTS timescaledb
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM pg_extension
          WHERE extname = 'timescaledb'
        ) THEN
          PERFORM create_hypertable(
            'read_market_trades',
            by_range('executed_at'),
            if_not_exists => TRUE,
            migrate_data => TRUE
          );
        END IF;
      EXCEPTION
        WHEN undefined_function THEN
          RAISE NOTICE 'timescaledb create_hypertable unavailable, skipping read_market_trades hypertable conversion';
        WHEN OTHERS THEN
          RAISE NOTICE 'timescaledb read_market_trades hypertable conversion skipped: %', SQLERRM;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM pg_extension
          WHERE extname = 'timescaledb'
        ) THEN
          PERFORM create_hypertable(
            'read_market_ohlcv',
            by_range('open_time'),
            if_not_exists => TRUE,
            migrate_data => TRUE,
            chunk_time_interval => INTERVAL '7 days'
          );
        END IF;
      EXCEPTION
        WHEN undefined_function THEN
          RAISE NOTICE 'timescaledb create_hypertable unavailable, skipping read_market_ohlcv hypertable conversion';
        WHEN OTHERS THEN
          RAISE NOTICE 'timescaledb read_market_ohlcv hypertable conversion skipped: %', SQLERRM;
      END $$;
    `);

    await queryRunner.query(`
      CREATE MATERIALIZED VIEW IF NOT EXISTS read_market_ohlcv_1m_timescale
      AS
      SELECT
        pair_id,
        time_bucket(INTERVAL '1 minute', open_time) AS bucket,
        MAX(close) AS close,
        MAX(high) AS high,
        MIN(low) AS low,
        MIN(open) AS open,
        SUM(volume) AS volume,
        SUM(quote_volume) AS quote_volume,
        SUM(trades_count) AS trades_count
      FROM read_market_ohlcv
      WHERE interval_sec = 60
      GROUP BY pair_id, time_bucket(INTERVAL '1 minute', open_time)
      WITH NO DATA
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM pg_extension
          WHERE extname = 'timescaledb'
        ) THEN
          PERFORM add_continuous_aggregate_policy(
            'read_market_ohlcv_1m_timescale',
            start_offset => INTERVAL '30 days',
            end_offset => INTERVAL '1 minute',
            schedule_interval => INTERVAL '5 minutes'
          );
        END IF;
      EXCEPTION
        WHEN undefined_function THEN
          RAISE NOTICE 'timescaledb continuous aggregate policy unavailable, skipping';
        WHEN OTHERS THEN
          RAISE NOTICE 'timescaledb continuous aggregate policy skipped: %', SQLERRM;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!this.isPostgres(queryRunner)) {
      return;
    }

    await queryRunner.query(`
      DROP MATERIALIZED VIEW IF EXISTS read_market_ohlcv_1m_timescale
    `);
  }
}
