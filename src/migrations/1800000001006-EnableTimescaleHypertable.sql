-- Phase 9: TimescaleDB hypertable conversion for OHLCV
-- Run this migration when TimescaleDB is available and benchmark recommends migration

-- Check if TimescaleDB extension is available
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
        RAISE NOTICE 'TimescaleDB extension not found. Skipping hypertable conversion.';
        RETURN;
    END IF;

    -- Convert read_market_ohlcv to hypertable
    SELECT create_hypertable(
        'read_market_ohlcv',
        'open_time',
        if_not_exists => TRUE,
        migrate_data => TRUE
    );

    -- Create index on pair_id for faster lookups
    CREATE INDEX IF NOT EXISTS idx_read_market_ohlcv_pair_id
        ON read_market_ohlcv (pair_id, open_time DESC);

    -- Set default chunk interval (1 hour for minute-level data)
    SELECT set_chunk_time_interval(
        'read_market_ohlcv',
        INTERVAL '1 hour'
    );

    -- Add compression policy (compress after 1 week)
    ALTER TABLE read_market_ohlcv SET (
        timescaledb.compress,
        timescaledb.compress_segmentby = 'pair_id'
    );

    SELECT add_compression_policy(
        'read_market_ohlcv',
        INTERVAL '1 week'
    );

    -- Add continuous aggregate for 1-minute intervals
    CREATE MATERIALIZED VIEW IF NOT EXISTS market_ohlcv_1m
    WITH (timescaledb.continuous) AS
    SELECT
        time_bucket('1 minute', open_time) AS bucket,
        pair_id,
        first(open, open_time) AS open,
        max(high) AS high,
        min(low) AS low,
        last(close, open_time) AS close,
        sum(volume) AS volume,
        count(*) AS trade_count
    FROM read_market_ohlcv
    WHERE interval_sec = 60
    GROUP BY bucket, pair_id;

    SELECT add_continuous_aggregate_policy(
        'market_ohlcv_1m',
        start_offset => INTERVAL '3 months',
        end_offset => INTERVAL '1 hour',
        schedule_interval => INTERVAL '1 minute'
    );

    -- Add continuous aggregate for 5-minute intervals
    CREATE MATERIALIZED VIEW IF NOT EXISTS market_ohlcv_5m
    WITH (timescaledb.continuous) AS
    SELECT
        time_bucket('5 minutes', open_time) AS bucket,
        pair_id,
        first(open, open_time) AS open,
        max(high) AS high,
        min(low) AS low,
        last(close, open_time) AS close,
        sum(volume) AS volume,
        count(*) AS trade_count
    FROM read_market_ohlcv
    WHERE interval_sec = 300
    GROUP BY bucket, pair_id;

    SELECT add_continuous_aggregate_policy(
        'market_ohlcv_5m',
        start_offset => INTERVAL '3 months',
        end_offset => INTERVAL '1 hour',
        schedule_interval => INTERVAL '5 minutes'
    );

    -- Add retention policy (keep 90 days of raw data)
    SELECT add_retention_policy(
        'read_market_ohlcv',
        INTERVAL '90 days'
    );

END $$;

-- Note: Run the benchmark first to determine if TimescaleDB is beneficial:
-- curl -X POST http://localhost:3000/admin/timescale/benchmark
