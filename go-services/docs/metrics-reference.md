# Prometheus Metrics Reference

Danh sách đầy đủ tất cả Prometheus metrics được expose bởi 3 Go services.

---

## Common Metrics (Tất cả services)

### Service Lifecycle

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `go_service_up` | Gauge | `service`, `env` | Service liveness. Set to 1 on startup. |
| `go_service_uptime_seconds` | Gauge | `service` | Service uptime in seconds. Updated every second. |
| `go_service_build_info` | Gauge | `service`, `version`, `commit` | Build metadata. Set to 1 on startup. |
| `go_service_mode_info` | Gauge | `service`, `shadow_mode`, `read_only_mode`, `mutations_enabled` | Safety mode flags. Set to 1 on startup. |

### HTTP

| Metric | Type | Labels | Buckets | Description |
|--------|------|--------|---------|-------------|
| `http_requests_total` | Counter | `method`, `path`, `status` | — | Total HTTP requests received. |
| `http_request_duration_seconds` | Histogram | `method`, `path` | DefBuckets | HTTP request latency in seconds. |
| `http_requests_in_flight` | Gauge | — | — | Number of HTTP requests currently being processed. |

---

## Market Aggregator (Port 8080)

### Kafka Consumer

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `aggregator_kafka_messages_total` | Counter | `topic` | Total Kafka messages consumed. |
| `aggregator_kafka_errors_total` | Counter | `topic` | Total Kafka consumer errors. |
| `aggregator_kafka_consumer_lag` | Gauge | `topic`, `partition` | Estimated consumer lag. Updated every 30s via `reader.Stats()`. |
| `aggregator_kafka_reconnects_total` | Counter | `topic` | Total Kafka reconnection attempts. |

### Redis

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `aggregator_redis_published_total` | Counter | `service` | Total Redis messages published via pub/sub. |
| `aggregator_redis_publish_latency_ms` | Gauge | `service` | Latency of last Redis publish call in milliseconds. |

### Ticker Cache

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `aggregator_symbol_count` | Gauge | `service` | Number of unique trading pairs in in-memory ticker cache. |
| `aggregator_stale_ticker_count` | Counter | `service` | Total tickers rejected due to being older than `MAX_TICKER_AGE_SECONDS`. |
| `aggregator_cache_evicted_total` | Counter | `service` | Total expired ticker cache entries evicted by TTL eviction loop. |
| `aggregator_cache_last_eviction_timestamp_seconds` | Gauge | `service` | Unix timestamp of last cache eviction run. |

### Cache TTL Settings

| Constant | Value | Description |
|----------|-------|-------------|
| `TickerCacheTTL` | 5 minutes | TTL for in-memory ticker cache entries. |
| `TickerCacheEvictionInterval` | 1 minute | Interval between TTL eviction runs. |
| `RedisTickerTTL` | 10 minutes | TTL for Redis key `shadow:go:market:ticker:{pair}`. |

---

## Matching Engine (Port 8081)

### Executor

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `matching_orders_processed_total` | Counter | `mode`, `pair`, `side` | Total orders processed by the matching executor. |
| `matching_trades_created_total` | Counter | `pair` | Total trades created. |
| `matching_errors_total` | Counter | — | Total errors during matching execution. |

### Shadow Engine

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `matching_shadow_processed_total` | Counter | `pair`, `status` | Total shadow matching runs processed. |
| `matching_shadow_matched_total` | Counter | `pair` | Shadow orders that produced matches. |
| `matching_shadow_skipped_total` | Counter | `pair` | Shadow orders that were skipped. |
| `matching_shadow_errors_total` | Counter | `pair` | Shadow processing errors. |
| `matching_shadow_match_rate_percent` | Gauge | `pair` | Shadow matching match rate as percentage. |
| `matching_shadow_unmatched_total` | Counter | `pair` | Shadow runs without corresponding actual trade. |

### Canary

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `matching_canary_pairs_count` | Gauge | — | Number of trading pairs currently in canary mode. |

### Execution

| Metric | Type | Labels | Buckets | Description |
|--------|------|--------|---------|-------------|
| `matching_execution_latency_ms` | Histogram | `pair` | 0.5, 1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000ms | Matching execution latency. |
| `matching_db_transaction_duration_ms` | Histogram | `pair` | 1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500ms | DB transaction duration. |

### Distributed Lock

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `matching_lock_acquired_total` | Counter | `pair` | Successful lock acquisitions. |
| `matching_lock_contention_total` | Counter | `pair` | Lock retries due to contention. |
| `matching_lock_failed_total` | Counter | `pair` | Failed lock acquisitions (timeout). |

### Circuit Breaker & Validation

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `matching_circuit_breaker_halted_total` | Counter | `pair` | Orders halted by circuit breaker. |
| `matching_price_deviation_rejected_total` | Counter | `pair` | Market orders rejected due to price slippage exceeding tolerance. |

### PostgreSQL Connection Pool

| Metric | Type | Description |
|--------|------|-------------|
| `go_postgres_pool_idle_connections` | Gauge | Current number of idle connections. |
| `go_postgres_pool_acquired_connections` | Gauge | Current number of acquired connections. |
| `go_postgres_pool_total_connections` | Gauge | Total connections in pool. |
| `go_postgres_pool_max_connections` | Gauge | Maximum pool size. |
| `go_postgres_pool_empty_acquisitions` | Counter | Times pool had no available connections. |
| `go_postgres_pool_canceled_acquisitions` | Counter | Times acquire was canceled. |

---

## Public WS Gateway (Port 8082)

### WebSocket Connections

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `ws_connections_total` | Counter | `namespace`, `type` | Total WebSocket connections established. `type` values: `connect`, `disconnect`. |
| `ws_connections_current` | Gauge | `namespace` | Current number of active connections. |
| `ws_subscriptions_current` | Gauge | — | Current number of active subscriptions. |

### WebSocket Messages

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `ws_messages_sent_total` | Counter | `namespace`, `event` | Total messages sent to clients. |
| `ws_messages_received_total` | Counter | `namespace`, `event` | Total messages received from clients. |

### Authentication & Subscriptions

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `ws_auth_failures_total` | Counter | `namespace` | Total authentication failures. |
| `ws_subscribe_operations_total` | Counter | `namespace`, `operation` | Total subscribe/unsubscribe operations. |

### Kafka (backup/fallback)

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `aggregator_kafka_messages_total` | Counter | `topic` | Kafka messages consumed for fallback data. |

---

## Usage Examples

### Query match rate của shadow engine

```promql
matching_shadow_match_rate_percent{pair="BTC/USDT"}
```

### Query lock contention

```promql
rate(matching_lock_contention_total[5m])
```

### Query p99 execution latency

```promql
histogram_quantile(0.99, rate(matching_execution_latency_ms_bucket[5m]))
```

### Query active WebSocket connections

```promql
ws_connections_current{namespace="/trading"}
```

### Query Kafka consumer lag

```promql
aggregator_kafka_consumer_lag{topic="crypto-trading.market.ticker"}
```

### Query PostgreSQL pool utilization

```promql
go_postgres_pool_acquired_connections / go_postgres_pool_max_connections
```
