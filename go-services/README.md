# Go Services — Production Microservices

Các service Go được tách theo clean architecture, chạy song song với NestJS backend trong giai đoạn chuyển đổi (Gradual Migration).

## Services

| Service | Port | Mục đích | Trạng thái |
|---------|------|-----------|-------------|
| `market-aggregator` | 8080 | Live ticker từ Kafka -> Redis pub/sub | Production Ready |
| `matching-engine` | 8081 | Order matching engine | In Development |
| `public-ws-gateway` | 8082 | Socket.IO server cho realtime data | In Development |

## Quick Start

### Development

```bash
# Build all services
make build

# Run all services locally
make run-dev

# Run a specific service
make run-one SERVICE=matching-engine

# Test a specific service
make test-one SERVICE=matching-engine
```

### Docker

```bash
# Build all Docker images
make docker-build

# Run via docker-compose (production)
docker compose -f docker-compose.prod.yml --env-file .env.production up -d market-aggregator matching-engine
```

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

Chi tiết kỹ thuật:

- [docs/README.md](docs/README.md) — System architecture, overview tất cả services
- [docs/matching-engine.md](docs/matching-engine.md) — Chi tiết Matching Engine
- [docs/metrics-reference.md](docs/metrics-reference.md) — Prometheus metrics reference

## Documentation

Chi tiết kỹ thuật từng service:

- [docs/README.md](docs/README.md) — System architecture, overview tất cả services
- [docs/matching-engine.md](docs/matching-engine.md) — Chi tiết Matching Engine
- [docs/metrics-reference.md](docs/metrics-reference.md) — Prometheus metrics reference

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
