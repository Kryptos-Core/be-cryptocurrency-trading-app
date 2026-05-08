-- Phase 5c: ClickHouse event_audit_log table
-- Run this migration in ClickHouse to create the audit log table

-- Create database if not exists
CREATE DATABASE IF NOT EXISTS analytics;

-- Create event_audit_log table
CREATE TABLE IF NOT EXISTS analytics.event_audit_log
(
    event_id String,
    event_type LowCardinality(String),
    aggregate_type LowCardinality(String),
    aggregate_id String,
    occurred_at DateTime64(3, 'UTC'),
    producer LowCardinality(String),
    schema_version UInt16,
    correlation_id String,
    partition_key String,
    payload String,
    ingested_at DateTime64(3, 'UTC') DEFAULT now64(3)
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(occurred_at)
ORDER BY (event_type, aggregate_id, occurred_at, event_id)
TTL occurred_at + INTERVAL 90 DAY
SETTINGS index_granularity = 8192;

-- Create ReplacingMergeTree variant for deduplication (optional, use if you want automatic dedup)
-- CREATE TABLE IF NOT EXISTS analytics.event_audit_log_replacing
-- (
--     event_id String,
--     event_type LowCardinality(String),
--     aggregate_type LowCardinality(String),
--     aggregate_id String,
--     occurred_at DateTime64(3, 'UTC'),
--     producer LowCardinality(String),
--     schema_version UInt16,
--     correlation_id String,
--     partition_key String,
--     payload String,
--     ingested_at DateTime64(3, 'UTC') DEFAULT now64(3)
-- )
-- ENGINE = ReplacingMergeTree(ingested_at)
-- PARTITION BY toYYYYMM(occurred_at)
-- ORDER BY (event_type, aggregate_id, occurred_at, event_id);
