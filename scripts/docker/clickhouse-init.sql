-- ClickHouse schema init script.
-- Idempotent: all statements use CREATE ... IF NOT EXISTS / OR REPLACE.
-- Run after ClickHouse is healthy.

-- Analytics database
CREATE DATABASE IF NOT EXISTS analytics ENGINE = Atomic;

-- Event audit log (Phase 5c)
-- NOTE: TTL on DateTime64 columns is not supported in ClickHouse 24.x.
-- Partition pruning via PARTITION BY toYYYYMM(occurred_at) handles cleanup instead.
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
SETTINGS index_granularity = 8192;

-- Order stats aggregates (Phase 5c+)
CREATE TABLE IF NOT EXISTS analytics.order_stats
(
    date Date,
    event_type LowCardinality(String),
    count UInt64,
    updated_at DateTime64(3, 'UTC') DEFAULT now64(3)
)
ENGINE = SummingMergeTree
ORDER BY (date, event_type)
TTL date + INTERVAL 90 DAY;

CREATE MATERIALIZED VIEW IF NOT EXISTS analytics.order_stats_mv
TO analytics.order_stats
AS
SELECT
    toDate(occurred_at) AS date,
    event_type,
    count() AS count
FROM analytics.event_audit_log
WHERE event_type IN ('orderplaced', 'ordercancelled', 'tradeexecuted')
GROUP BY date, event_type;

-- Balance change aggregates
CREATE TABLE IF NOT EXISTS analytics.balance_aggregates
(
    date Date,
    aggregate_id String,
    currency String,
    total_deposits Decimal(36, 18),
    total_withdrawals Decimal(36, 18),
    net_change Decimal(36, 18),
    updated_at DateTime64(3, 'UTC') DEFAULT now64(3)
)
ENGINE = SummingMergeTree
ORDER BY (date, aggregate_id, currency)
TTL date + INTERVAL 90 DAY;
