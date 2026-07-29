# Go Services — Production Microservices

Các service Go được tách theo clean architecture, chạy song song với NestJS backend trong giai đoạn chuyển đổi (Gradual Migration).

## Services

| Service | Port | Mục đích | Trạng thái |
|---------|------|-----------|-------------|
| `market-aggregator` | 8080 | Live ticker từ Kafka -> Redis pub/sub | Production Ready |
| `matching-engine` | 8081 | Order matching engine | In Development |
| `public-ws-gateway` | 8082 | Socket.IO server cho realtime data | In Development |

## Quick Start

> **Recommended workflow (Windows / Linux / macOS):** dùng Docker Compose để khởi động infrastructure + Go services. Xem [Running with Docker](#running-with-docker--khuyến-nghị).
>
> Makefile targets `run-dev` / `run-one` dùng bash shell (`if [ ... ]; then`) và không hoạt động trên Windows `make` của GnuWin32. Trên Windows hãy dùng Docker Compose hoặc WSL/Git Bash.

### Development (Linux / macOS — bash `make`)

```bash
# Build all services
make build

# Run all services locally (requires bash; not Windows GnuWin32 make)
make run-dev

# Run a specific service
make run-one SERVICE=matching-engine

# Test a specific service
make test-one SERVICE=matching-engine
```

### Running with Docker — Khuyến nghị

Compose file chính ở repo root backend `docker-compose.yml` include `docker-compose.infrastructure.yml` và định nghĩa 3 Go services (`market-aggregator`, `matching-engine`, `public-ws-gateway`) trong profile `services`. Tất cả services join chung network `crypto-trading-network` để resolve Postgres/Redis/Kafka bằng hostname Docker.

```bash
# Khởi động infrastructure + Go services (chạy từ be-cryptocurrency-trading-app/)
docker compose -f docker-compose.yml up -d --profile services

# Chỉ infrastructure (Postgres + Redis)
docker compose -f docker-compose.yml up -d

# Chỉ một service (vd. market-aggregator)
docker compose -f docker-compose.yml up -d --profile services market-aggregator

# Xem logs (theo dõi stdout của service)
docker compose -f docker-compose.yml logs -f market-aggregator

# Stop tất cả
docker compose -f docker-compose.yml down

# Rebuild và restart một service (sau khi đổi code)
docker compose -f docker-compose.yml up -d --build matching-engine
```

Hoặc dùng wrapper Makefile (cross-platform, cũng chạy trên Windows):

```bash
cd go-services

# Start infrastructure + Go services
make docker-up

# Chỉ infrastructure
make docker-up-infra

# Chỉ một service
make docker-up-one SERVICE=matching-engine

# Logs
make docker-logs SERVICE=market-aggregator
make docker-logs-all

# Restart / rebuild
make docker-restart SERVICE=matching-engine
make docker-rebuild SERVICE=matching-engine

# Stop
make docker-down
```

#### Profiles & dependencies

| Profile / service | Bật khi nào | Depends on |
|-------------------|-------------|------------|
| `market-aggregator` | Mặc định trong profile `services` | Postgres + Redis (healthy) |
| `matching-engine`  | Mặc định trong profile `services` | Postgres + Redis (healthy) |
| `public-ws-gateway`| Mặc định trong profile `services` | Redis (healthy) |
| `kafka`            | `--profile kafka` | Zookeeper |
| `clickhouse`       | `--profile clickhouse` | — |
| `timescale`        | `--profile timescale` | — |

Network: tất cả containers nằm trong `crypto-trading-network` (đặt tên cố định để NestJS backend container trong `docker-compose.prod.yml` / `docker-compose.staging.yml` có thể join cùng network và resolve host `market-aggregator`, `matching-engine`, `public-ws-gateway`).

#### Env vars cho Docker Compose

Compose file dùng biến từ `.env.development`. Các biến chính:

- `MARKET_AGGREGATOR_PORT` (mặc định `8080`)
- `MATCHING_ENGINE_PORT` (mặc định `8081`)
- `PUBLIC_WS_GATEWAY_PORT` (mặc định `8082`)
- `KAFKA_BROKERS` (mặc định `kafka:9092`, chỉ dùng khi bật profile `kafka`)
- `REDIS_PASSWORD`, `CORE_DB_*`, `LOG_LEVEL`

### Docker (production / staging)

Production/Staging compose riêng (`docker-compose.prod.yml`, `docker-compose.staging.yml`) đã chứa Go services. Trên môi trường đó dùng profile cũ (`go-risky`, `go-canary`) — xem [docs/GO_SERVICES_PRODUCTION_ROLLOUT.md](../docs/GO_SERVICES_PRODUCTION_ROLLOUT.md).

## Architecture

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
│Aggregator     │  │                 │  │                       │
│(Go)           │  │ (Go)            │  │ (Go)                  │
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

## Feature Flags

### TICKER_SOURCE
| Value | Description |
|-------|-------------|
| `nestjs` | NestJS Binance WS source (default) |
| `go_aggregator` | Go market-aggregator source |

### MATCHING_ENGINE
| Value | Description |
|-------|-------------|
| `ts` | NestJS matching (default) |
| `go_shadow` | Go shadow mode — chạy song song, không ghi DB |
| `go_canary` | Go canary — xử lý một số pairs nhất định |
| `go` | Go chính — NestJS off (chưa implement) |

### PUBLIC_WS
| Value | Description |
|-------|-------------|
| `nestjs` | NestJS Socket.IO gateway (default) |
| `go` | Go Socket.IO gateway (chưa implement) |

## Monitoring

Tất cả services expose:

- `GET /healthz` — Liveness probe
- `GET /readyz` — Readiness probe (kiểm tra Redis, Kafka, PostgreSQL)
- `GET /metrics` — Prometheus metrics

### Prometheus Metrics

**Market Aggregator:**
```
go_service_up{service="market-aggregator"}
go_service_kafka_messages_total{service="market-aggregator"}
go_service_redis_published_total{service="market-aggregator"}
```

**Matching Engine:**
```
go_service_kafka_messages_total{service="matching-engine"}
matching_orders_processed_total{}
matching_trades_created_total{}
```

**Public WS Gateway:**
```
go_service_up{service="public-ws-gateway"}
ws_connections_total{namespace="/trading"}
```

## Development

### Prerequisites
- Go 1.23+
- Docker & Docker Compose (for integration tests)
- `make` (optional, Makefile available)

### Adding Dependencies

```bash
cd <service-name>
go get github.com/new/package@v1.2.3
go mod tidy
```

### Running Tests

```bash
# All services
make test

# Specific service
make test-one SERVICE=matching-engine

# With coverage
make test-cover SERVICE=matching-engine

# With race detector
make test-race SERVICE=matching-engine
```

### CI/CD

GitHub Actions workflow: `.github/workflows/go-services.yml`

Pipeline:
1. Lint & Vet
2. Unit Tests (with race detector)
3. Integration Tests (on merge_group/main)
4. Docker Build

## Roadmap

- [x] Phase 1: Market Aggregator (reliability, multi-symbol, backfill)
- [x] Phase 2: Matching Engine — Order Book + Strategy + Lock
- [x] Phase 3: Matching Engine — DB Transaction Commit
- [x] Phase 4: Matching Engine — Shadow Mode Enhancement + Reconciliation
- [x] Phase 5: Matching Engine — Canary Mode + Gradual Rollout
- [x] Phase 6: Public WS Gateway — Socket.IO Server
- [x] Phase 7: Public WS Gateway — Auth, Subscriptions, Dashboard
- [x] Phase 8: Production Readiness — Metrics, Load Testing

## Documentation

Chi tiết kỹ thuật từng service:

- [docs/README.md](docs/README.md) — System architecture, overview tất cả services
- [docs/matching-engine.md](docs/matching-engine.md) — Chi tiết Matching Engine
- [docs/metrics-reference.md](docs/metrics-reference.md) — Prometheus metrics reference
- [../docs/GO_SERVICES_PRODUCTION_ROLLOUT.md](../docs/GO_SERVICES_PRODUCTION_ROLLOUT.md) — Rollout & safety policy cho production.

## Structure

```
go-services/
├── Makefile
├── README.md
├── .github/workflows/go-services.yml
├── market-aggregator/
│   ├── go.mod / go.sum
│   ├── Dockerfile
│   ├── cmd/market-aggregator/main.go
│   └── internal/
│       ├── app/app.go
│       └── ...
├── matching-engine/
│   ├── go.mod / go.sum
│   ├── Dockerfile
│   ├── cmd/matching-engine/main.go
│   └── internal/
│       ├── domain/
│       │   ├── types.go
│       │   ├── orderbook/
│       │   └── matching/
│       ├── infrastructure/
│       │   ├── lock/
│       │   └── persistence/
│       └── application/
│           ├── shadow_engine.go
│           ├── reconciliation.go
│           └── canary.go
└── public-ws-gateway/
    ├── go.mod / go.sum
    ├── Dockerfile
    ├── cmd/public-ws-gateway/main.go
    └── internal/
        ├── adapter/socketio/
        │   ├── server.go
        │   └── handlers/
        └── infrastructure/
            └── ticker/
```

## Safety

Matching Engine chạy trong các chế độ an toàn:

- **Shadow Mode** (`SHADOW_MODE=true`): Không ghi bất kỳ dữ liệu production nào. Chỉ ghi vào `shadow_matching_runs` để so sánh với kết quả NestJS.
- **Read Only** (`READ_ONLY_MODE=true`): Không có quyền ghi vào PostgreSQL.
- **Mutations Disabled** (`MUTATIONS_ENABLED=false`): Không commit bất kỳ transaction nào.
- **Profiles**: Docker Compose profiles (`go-risky`, `go-canary`) ngăn accidental startup trong production.
