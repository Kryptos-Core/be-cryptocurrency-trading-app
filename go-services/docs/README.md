# Go Services — Technical Documentation

> **Go version:** 1.23+
>
> **Trạng thái các services:**
>
> | Service | Trạng thái | Port |
> |---------|-----------|------|
> | Market Aggregator | Production Ready | 8080 |
> | Matching Engine | Production Ready | 8081 |
> | Public WS Gateway | Production Ready | 8082 |

---

## Mục lục

1. [System Architecture](#1-system-architecture)
2. [Shared Infrastructure](#2-shared-infrastructure)
3. [Market Aggregator](#3-market-aggregator)
4. [Matching Engine](#4-matching-engine)
5. [Public WS Gateway](#5-public-ws-gateway)
6. [Prometheus Metrics Reference](#6-prometheus-metrics-reference)
7. [Deployment](#7-deployment)

---

## 1. System Architecture

### 1.1 High-level overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                        NestJS Backend                                 │
│  REST API  │  Socket.IO /trading  │  Matching Engine (TypeScript)  │
└───────┬──────────────────────────────────────────────────┬───────────┘
        │                                                  │
        │  Kafka: orderplaced, tradeexecuted               │
        │  Redis: trading:price_update                     │
        └──────────────────┬───────────────────────────────┘
                           │
        ┌──────────────────┼───────────────────────────────┐
        │                  │                               │
        ▼                  ▼                               ▼
┌───────────────┐  ┌─────────────────┐  ┌─────────────────────────┐
│Market         │  │ Matching Engine  │  │ Public WS Gateway      │
│Aggregator     │  │ (Go)            │  │ (Go)                  │
│               │  │                 │  │                       │
│Kafka consumer │  │ Kafka consumer  │  │ Socket.IO server      │
│Redis pub/sub  │  │ Redis lock      │  │ Redis subscriber      │
│               │  │ PostgreSQL tx   │  │                       │
└───────────────┘  └─────────────────┘  └─────────────────────────┘
                           │
                           ▼
                    ┌──────────────┐
                    │ PostgreSQL   │
                    │ Wallets/     │
                    │ Orders/Trades│
                    └──────────────┘
```

### 1.2 Feature Flags (từ NestJS)

| Flag | Giá trị | Mô tả |
|------|---------|--------|
| `TICKER_SOURCE` | `nestjs` / `go_aggregator` | Nguồn ticker data |
| `MATCHING_ENGINE` | `ts` / `go_shadow` / `go_canary` / `go` | Engine được sử dụng |
| `PUBLIC_WS` | `nestjs` / `go` | Socket.IO gateway |

### 1.3 Directory structure

```
go-services/
├── docs/
│   ├── README.md              ← (file này)
│   ├── matching-engine.md     ← Chi tiết Matching Engine
│   └── metrics-reference.md   ← Prometheus metrics reference
├── metrics/
│   └── metrics.go             ← Shared Prometheus metrics
├── Makefile
├── .github/workflows/
│   └── go-services.yml
├── market-aggregator/
│   ├── cmd/market-aggregator/main.go
│   ├── internal/
│   │   ├── app/app.go         ← Server, Kafka consumer, Redis pub/sub
│   │   └── infrastructure/
│   │       └── config/config.go
│   └── ...
├── matching-engine/
│   ├── cmd/matching-engine/main.go
│   ├── internal/
│   │   ├── domain/
│   │   │   ├── types.go
│   │   │   ├── orderbook/orderbook.go
│   │   │   ├── matching/strategy.go
│   │   │   └── shadow/shadow.go
│   │   ├── infrastructure/
│   │   │   ├── lock/lock.go
│   │   │   └── persistence/ (tx, order, trade, shadow, errors)
│   │   └── application/
│   │       ├── app.go
│   │       ├── executor.go
│   │       ├── shadow_engine.go
│   │       ├── reconciliation.go
│   │       └── canary/canary.go
│   └── ...
└── public-ws-gateway/
    ├── cmd/public-ws-gateway/main.go
    ├── internal/
    │   ├── app/app.go
    │   ├── adapter/socketio/
    │   │   ├── server.go
    │   │   └── handlers/ (auth, events, subscribe, workspace)
    │   └── infrastructure/ticker/
    │       └── redis_subscriber.go
    └── ...
```

---

## 2. Shared Infrastructure

### 2.1 Shared Prometheus Metrics (`metrics/metrics.go`)

Tất cả 3 services sử dụng chung metrics package:

```go
import "github.com/kryptos/go-services/metrics"
```

**Service lifecycle metrics:**

| Metric | Type | Labels | Mô tả |
|--------|------|--------|--------|
| `go_service_up` | Gauge | `service`, `env` | Service liveness (1=up) |
| `go_service_uptime_seconds` | Gauge | `service` | Uptime in seconds |
| `go_service_build_info` | Gauge | `service`, `version`, `commit` | Build metadata |
| `go_service_mode_info` | Gauge | `service`, `shadow_mode`, `read_only_mode`, `mutations_enabled` | Safety mode flags |

**HTTP metrics:**

| Metric | Type | Labels | Mô tả |
|--------|------|--------|--------|
| `http_requests_total` | Counter | `method`, `path`, `status` | Total HTTP requests |
| `http_request_duration_seconds` | Histogram | `method`, `path` | Request latency |
| `http_requests_in_flight` | Gauge | — | Current in-flight requests |

**Kafka metrics (shared):**

| Metric | Type | Labels | Mô tả |
|--------|------|--------|--------|
| `aggregator_kafka_messages_total` | Counter | `topic` | Kafka messages consumed |
| `aggregator_kafka_errors_total` | Counter | `topic` | Consumer errors |
| `aggregator_kafka_consumer_lag` | Gauge | `topic`, `partition` | Consumer lag |
| `aggregator_kafka_reconnects_total` | Counter | `topic` | Reconnection attempts |

**Matching Engine metrics:**

| Metric | Type | Labels | Mô tả |
|--------|------|--------|--------|
| `matching_orders_processed_total` | Counter | `mode`, `pair`, `side` | Orders processed |
| `matching_trades_created_total` | Counter | `pair` | Trades created |
| `matching_execution_latency_ms` | Histogram | `pair` | Execution latency |
| `matching_lock_acquired_total` | Counter | `pair` | Lock acquisitions |
| `matching_lock_contention_total` | Counter | `pair` | Lock retries |
| `matching_lock_failed_total` | Counter | `pair` | Failed lock acquisitions |
| `matching_circuit_breaker_halted_total` | Counter | `pair` | Orders halted |
| `matching_price_deviation_rejected_total` | Counter | `pair` | Price deviation rejects |
| `matching_shadow_match_rate_percent` | Gauge | `pair` | Shadow match rate |
| `matching_shadow_unmatched_total` | Counter | `pair` | Unmatched shadow runs |
| `matching_shadow_processed_total` | Counter | `pair`, `status` | Shadow runs processed |
| `matching_db_transaction_duration_ms` | Histogram | `pair` | DB transaction duration |
| `go_postgres_pool_*` | Gauges | — | PostgreSQL pool stats |

**WebSocket metrics:**

| Metric | Type | Labels | Mô tả |
|--------|------|--------|--------|
| `ws_connections_total` | Counter | `namespace`, `type` | Connection count |
| `ws_connections_current` | Gauge | `namespace` | Current connections |
| `ws_subscriptions_current` | Gauge | — | Current subscriptions |
| `ws_messages_sent_total` | Counter | `namespace`, `event` | Messages sent |
| `ws_messages_received_total` | Counter | `namespace`, `event` | Messages received |
| `ws_auth_failures_total` | Counter | `namespace` | Auth failures |
| `ws_subscribe_operations_total` | Counter | `namespace`, `operation` | Subscribe/unsubscribe ops |

**Kafka Producer metrics (shared):**

| Metric | Type | Labels | Mô tả |
|--------|------|--------|--------|
| `kafka_producer_messages_total` | Counter | `topic` | Messages produced |
| `kafka_producer_errors_total` | Counter | `topic` | Producer errors |
| `kafka_producer_latency_ms` | Histogram | `topic` | Producer latency |

---

## 3. Market Aggregator

### 3.1 Responsibility

Market Aggregator tiếp nhận ticker data từ Kafka (`crypto-trading.market.ticker`, `market.ticker`) và phát lại qua Redis pub/sub channel (`trading:external:ticker`). Đây là pipeline dữ liệu one-way: Kafka → Go → Redis.

### 3.2 Data flow

```
Kafka Topic (crypto-trading.market.ticker)
       │
       ▼
  Kafka Reader (consumer group: market-aggregator-prod-v1)
       │
       ▼
  Parse tickerPayload từ JSON envelope
       │
       ├─► Stale ticker check (MAX_TICKER_AGE_SECONDS=30s)
       │       │
       │       └─► Nếu stale → skip + increment staleTickerCount
       │
       ▼
  Transform schema: snake_case → pair_id
       │
       ▼
  In-memory tickerCache (sync.Map, TTL 5 phút)
       │
       ├─► SET shadow:go:market:ticker:{pair} (10 phút TTL)
       │
       └─► PUBLISH trading:external:ticker
               │
               └─► Public WS Gateway nhận qua RedisSubscriber
```

### 3.3 Key features

- **Backfill on startup:** Scan Redis keys `shadow:go:market:ticker:*` và publish lại để đảm bảo không miss data khi restart.
- **TTL eviction:** Background goroutine chạy mỗi 1 phút xoá entries cũ hơn 5 phút.
- **Stale ticker rejection:** Tickers cũ hơn `MARKET_AGGREGATOR_MAX_TICKER_AGE_SECONDS` (default 30s) hoặc future-dated > 5s sẽ bị reject.
- **Reconnection với exponential backoff:** Exponential backoff với jitter, cap 60s.
- **Kafka stats reporting:** Goroutine báo cáo consumer lag mỗi 30s.

### 3.4 HTTP endpoints

| Endpoint | Mô tả |
|----------|--------|
| `GET /` | Service info + mode |
| `GET /healthz` | Liveness probe |
| `GET /readyz` | Readiness probe (Redis ping + Kafka grace period) |
| `GET /metrics` | Prometheus metrics |

### 3.5 Environment variables

| Variable | Default | Mô tả |
|----------|---------|--------|
| `SERVICE_NAME` | `market-aggregator` | Tên service |
| `SERVICE_ENV` | `production` | Environment |
| `HTTP_ADDR` | `:8080` | HTTP listen address |
| `KAFKA_BROKERS` | `kafka:9092` | Kafka broker addresses |
| `KAFKA_GROUP` | `market-aggregator-prod-v1` | Consumer group ID |
| `KAFKA_TOPICS` | `crypto-trading.market.ticker,market.ticker` | Topics để consume |
| `REDIS_ADDR` | `redis:6379` | Redis address |
| `GO_AGGREGATOR_TICKER_CHANNEL` | `trading:external:ticker` | Redis pub/sub channel |
| `MARKET_AGGREGATOR_MAX_TICKER_AGE_SECONDS` | `30` | Stale ticker threshold |

---

## 4. Matching Engine

Xem [docs/matching-engine.md](matching-engine.md) để biết chi tiết đầy đủ.

### 4.1 Quick reference

| Chế độ | Env | Hành vi |
|--------|-----|---------|
| Shadow | `SHADOW_MODE=true` | Chạy matching, chỉ ghi `shadow_matching_runs` |
| Canary | `MATCHING_GO_CANARY_PAIRS=CSV` | Một số pairs được xử lý thực sự |
| Read Only | `READ_ONLY_MODE=true` | Không ghi DB |
| Active | `MUTATIONS_ENABLED=true` | Commit transactions bình thường |

---

## 5. Public WS Gateway

### 5.1 Responsibility

Public WS Gateway là Socket.IO server phục vụ dữ liệu realtime (ticker, order book) cho clients. Nhận ticker data qua Redis pub/sub từ Market Aggregator.

### 5.2 Architecture

```
┌──────────────┐
│ Clients      │
│ (Web/Mobile) │
└──────┬───────┘
       │ Socket.IO /trading
       ▼
┌──────────────────────────┐
│ Socket.IO Server         │
│ (Go)                    │
│                         │
│ ├── Auth Handler         │ JWT validation
│ ├── Subscribe Handler   │ Subscription management
│ ├── Events Handler      │ Trade/Ticker events
│ └── Workspace Handler   │ Workspace events
└───────────┬──────────────┘
            │
            ├─► RedisSubscriber ◄── Redis pub/sub
            │    (ticker channel)    (trading:external:ticker)
            │
            └─► Kafka Consumer ◄── Kafka topics
                 (backup/fallback)
```

### 5.3 Socket.IO events

**Client → Server:**

| Event | Payload | Mô tả |
|-------|---------|--------|
| `auth` | `{ token: string }` | Authenticate connection |
| `subscribe` | `{ channel: string }` | Subscribe vào channel |
| `unsubscribe` | `{ channel: string }` | Unsubscribe khỏi channel |
| `join_workspace` | `{ workspaceId: string }` | Join workspace room |
| `leave_workspace` | `{ workspaceId: string }` | Leave workspace room |

**Server → Client:**

| Event | Payload | Mô tả |
|-------|---------|--------|
| `auth_response` | `{ success: bool, error?: string }` | Auth result |
| `ticker` | Ticker payload | Realtime ticker update |
| `trade` | Trade payload | Trade executed notification |
| `subscription_confirmed` | `{ channel: string }` | Subscribe thành công |
| `subscription_removed` | `{ channel: string }` | Unsubscribe thành công |

### 5.4 HTTP endpoints

| Endpoint | Mô tả |
|----------|--------|
| `GET /` | Service info |
| `GET /healthz` | Liveness probe |
| `GET /readyz` | Readiness probe (Redis check) |
| `GET /metrics` | Prometheus metrics |

### 5.5 Environment variables

| Variable | Default | Mô tả |
|----------|---------|--------|
| `SERVICE_NAME` | `public-ws-gateway` | Tên service |
| `SERVICE_ENV` | `production` | Environment |
| `HTTP_ADDR` | `:8082` | HTTP listen address |
| `KAFKA_BROKERS` | `kafka:9092` | Kafka broker addresses |
| `KAFKA_GROUP` | `public-ws-gateway-prod-v1` | Consumer group ID |
| `KAFKA_TOPICS` | `crypto-trading.market.ticker,market.ticker` | Topics để consume |
| `REDIS_ADDR` | `redis:6379` | Redis address |
| `TICKER_CHANNEL` | `trading:external:ticker` | Redis pub/sub channel |

---

## 6. Prometheus Metrics Reference

Xem [docs/metrics-reference.md](metrics-reference.md) để biết danh sách đầy đủ.

---

## 7. Deployment

### 7.1 Local development (Windows / Linux / macOS) — Docker Compose

Compose file chính ở repo root backend `docker-compose.yml` include `docker-compose.infrastructure.yml` và định nghĩa 3 Go services trong profile `services`. Tất cả containers join network `crypto-trading-network` để resolve Postgres/Redis/Kafka bằng hostname Docker.

```bash
# Khởi động infrastructure + 3 Go services
docker compose -f docker-compose.yml up -d --profile services

# Chỉ infrastructure
docker compose -f docker-compose.yml up -d

# Chỉ một service (vd. market-aggregator)
docker compose -f docker-compose.yml up -d --profile services market-aggregator

# Logs
docker compose -f docker-compose.yml logs -f market-aggregator

# Stop
docker compose -f docker-compose.yml down
```

Cross-platform wrapper Makefile ở `go-services/Makefile` (`docker-up`, `docker-up-infra`, `docker-up-one SERVICE=...`, `docker-down`, `docker-logs`, `docker-restart`, `docker-rebuild`) chạy được trên Windows, không phụ thuộc bash shell.

> **Note:** Trên local dev, các services bind ra host ports `MARKET_AGGREGATOR_PORT` (default 8080), `MATCHING_ENGINE_PORT` (8081), `PUBLIC_WS_GATEWAY_PORT` (8082). Khuyến nghị dùng Docker Compose thay vì `make run-dev` (Makefile targets `run-dev` / `run-one` dùng bash `if [ ... ]; then` syntax không hoạt động với GnuWin32 `make` trên Windows).

### 7.2 Production / Staging

Production/Staging dùng compose riêng (`docker-compose.prod.yml`, `docker-compose.staging.yml`) với profile `go-risky` (matching-engine) và `go-canary` (public-ws-gateway). Xem [docs/GO_SERVICES_PRODUCTION_ROLLOUT.md](../../docs/GO_SERVICES_PRODUCTION_ROLLOUT.md).

### 7.3 Docker Compose Profiles

```yaml
# docker-compose.prod.yml

# Market Aggregator — luôn chạy được
market-aggregator:
  profiles: []

# Matching Engine — an toàn mặc định (shadow mode)
matching-engine:
  profiles: [go-risky, go-canary]  # Không start accidental trong production
  environment:
    MUTATIONS_ENABLED: "false"
    SHADOW_MODE: "true"

# Public WS Gateway — luôn chạy được
public-ws-gateway:
  profiles: []
```

### 7.4 Quick commands

```bash
# Docker Compose — khuyến nghị cho local dev (cross-platform)
make docker-up                    # Start infrastructure + 3 services
make docker-up-one SERVICE=matching-engine
make docker-logs SERVICE=market-aggregator
make docker-restart SERVICE=matching-engine
make docker-rebuild SERVICE=matching-engine
make docker-down

# Build Go binaries (Linux / macOS bash only)
make build

# Run all services locally (Linux / macOS bash only — không chạy trên GnuWin32 make)
make run-dev

# Run specific service (Linux / macOS bash only)
make run-one SERVICE=matching-engine

# Test specific service (cross-platform)
make test-one SERVICE=matching-engine

# Test with coverage
make test-cover SERVICE=matching-engine

# Test with race detector
make test-race SERVICE=matching-engine
```

### 7.5 CI/CD Pipeline

```
.github/workflows/go-services.yml
    │
    ├─► Lint (go vet)
    ├─► Unit Tests + Race Detector
    ├─► Integration Tests (merge_group / main only)
    └─► Docker Build + Push
```

### 7.6 Health checks

Tất cả services đều expose:

```
GET /healthz  — Liveness probe (chỉ check service up)
GET /readyz   — Readiness probe (check Redis, Kafka, PostgreSQL)
GET /metrics  — Prometheus metrics
```

### 7.7 Migration roadmap

| Phase | Nội dung | Trạng thái |
|-------|----------|-------------|
| Phase 1 | Market Aggregator | ✅ Done |
| Phase 2 | Matching Engine — Order Book + Strategy + Lock | ✅ Done |
| Phase 3 | Matching Engine — DB Transaction Commit | ✅ Done |
| Phase 4 | Matching Engine — Shadow Mode + Reconciliation | ✅ Done |
| Phase 5 | Matching Engine — Canary Mode + Gradual Rollout | ✅ Done |
| Phase 6 | Public WS Gateway — Socket.IO Server | ✅ Done |
| Phase 7 | Public WS Gateway — Auth, Subscriptions, Dashboard | ✅ Done |
| Phase 8 | Production Readiness — Metrics, Load Testing | ✅ Done |
