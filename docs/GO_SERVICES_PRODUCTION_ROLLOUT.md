# Go Services Production Rollout

This document records the production-ready rollout path for the Go services under `go-services/`.

> Last reviewed: 2026-07-29 — verified against `docker-compose.yml`, `docker-compose.prod.yml`, `docker-compose.staging.yml`, `go-services/Makefile`.

## Local development (Windows / Linux / macOS)

Trên local dev, đặc biệt trên **Windows** (GnuWin32 `make` không parse được bash syntax `if [ ... ]; then` của target `run-dev`/`run-one`), dùng unified Docker Compose ở repo root:

```bash
# Từ be-cryptocurrency-trading-app/
docker compose -f docker-compose.yml up -d --profile services

# Hoặc dùng wrapper Makefile (cross-platform)
cd go-services
make docker-up                    # infrastructure + 3 services
make docker-up-infra              # chỉ infrastructure
make docker-up-one SERVICE=matching-engine
make docker-logs SERVICE=market-aggregator
make docker-restart SERVICE=matching-engine
make docker-rebuild SERVICE=matching-engine
make docker-down
```

Tất cả containers join network `crypto-trading-network` để resolve Postgres / Redis / Kafka bằng hostname Docker. Chi tiết: [`go-services/README.md`](../go-services/README.md), [`../README.md`](../README.md).

## Current status

The repository now contains runnable Go service skeletons for:

- `market-aggregator` — first service to deploy, shadow/read-only by default.
- `matching-engine` — high-risk service, only available behind the `go-risky` compose profile and mutation-disabled by default.
- `public-ws-gateway` — canary service, only available behind the `go-canary` compose profile and 0% traffic by default.

The existing NestJS backend remains the production source of truth.

## Safety policy

Initial production mode is intentionally conservative:

- Go services run inside Docker, not `go run` or host systemd.
- Services expose only Docker-network ports by default.
- Services use JSON logs to stdout.
- Services provide `/healthz`, `/readyz`, and `/metrics`.
- Containers are `read_only`, `no-new-privileges`, and have a `/tmp` tmpfs.
- `matching-engine` must keep `MUTATIONS_ENABLED=false` until a separate parity and reconciliation sign-off.

## Docker Compose services

`docker-compose.prod.yml` includes:

```text
market-aggregator      default production compose service
matching-engine        profile: go-risky
public-ws-gateway      profile: go-canary
```

`market-aggregator` is included in the default compose graph because it is configured shadow/read-only and does not receive public traffic.

`matching-engine` and `public-ws-gateway` require explicit profile opt-in.

### Shared Docker network

Tất cả containers (infrastructure lẫn Go services) join network `crypto-trading-network` (name cố định). Nhờ đó NestJS backend container trong `docker-compose.prod.yml` / `docker-compose.staging.yml` có thể resolve host `market-aggregator`, `matching-engine`, `public-ws-gateway` mà không cần link thủ công. File `docker-compose.infrastructure.yml` (cũng include bởi `docker-compose.yml` ở repo root) define network này.

### Local dev compose

Repo root `docker-compose.yml` (include `docker-compose.infrastructure.yml`) thêm 3 Go services trong profile `services` cho local dev workflow:

```bash
docker compose -f docker-compose.yml up -d --profile services
```

Cùng network `crypto-trading-network`, image build từ `./go-services/<service>/Dockerfile`.

## Build and validation

From the repository root:

```bash
cd /home/ubuntu/crypto-trading

go test ./go-services/market-aggregator/...
go test ./go-services/matching-engine/...
go test ./go-services/public-ws-gateway/...

docker compose -f docker-compose.prod.yml --env-file .env.prod config

docker compose -f docker-compose.prod.yml --env-file .env.prod build market-aggregator
```

Run all Go image builds:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod --profile go-risky --profile go-canary build \
  market-aggregator matching-engine public-ws-gateway
```

## Deploy market-aggregator first

```bash
cd /home/ubuntu/crypto-trading

docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build market-aggregator

docker ps | grep crypto_market_aggregator

docker inspect crypto_market_aggregator --format '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{end}}'

docker logs --tail=100 crypto_market_aggregator
```

Network checks:

```bash
docker exec crypto_backend wget -qO- http://market-aggregator:8080/healthz

docker exec crypto_backend wget -qO- http://market-aggregator:8080/readyz

docker exec crypto_backend wget -qO- http://market-aggregator:8080/metrics | head
```

## Deploy matching-engine shadow only

Do not deploy this service without the explicit profile and safety flags:

```bash
MATCHING_ENGINE_SHADOW_MODE=true \
MATCHING_ENGINE_MUTATIONS_ENABLED=false \
docker compose -f docker-compose.prod.yml --env-file .env.prod --profile go-risky up -d --build matching-engine
```

Required pre-cutover criteria before any real mutation path is considered:

- Shadow mismatch rate is below the agreed threshold for at least 7 days.
- No unexpected restarts or panics.
- Replay tests against historical order events pass.
- Consumer lag remains stable under production load.
- Reconciliation/rollback runbook exists and has been tested.

## Deploy public-ws-gateway canary

```bash
PUBLIC_WS_GATEWAY_CANARY_PERCENT=0 \
docker compose -f docker-compose.prod.yml --env-file .env.prod --profile go-canary up -d --build public-ws-gateway
```

Only raise `PUBLIC_WS_GATEWAY_CANARY_PERCENT` after internal checks pass. Keep NestJS `/trading` fallback for at least one release.

Suggested progression:

```text
0% -> internal only
1% -> small canary
5% -> load observation
25% -> partial rollout
50% -> broad rollout
100% -> cutover after fallback confidence
```

## Prometheus

`prometheus/prometheus.yml` now has scrape jobs for:

- `go-market-aggregator` at `market-aggregator:8080/metrics`
- `go-matching-engine` at `matching-engine:8081/metrics`
- `go-public-ws-gateway` at `public-ws-gateway:8082/metrics`

Optional-profile services may appear down when the profile is not running. Alerts should account for whether a service is intentionally enabled.

## Rollback

Market aggregator:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod stop market-aggregator
```

Matching engine:

```bash
MATCHING_ENGINE_MUTATIONS_ENABLED=false
docker compose -f docker-compose.prod.yml --env-file .env.prod --profile go-risky stop matching-engine
```

Public WS gateway:

```bash
PUBLIC_WS_GATEWAY_CANARY_PERCENT=0
docker compose -f docker-compose.prod.yml --env-file .env.prod --profile go-canary stop public-ws-gateway
```

## Implementation notes

The current Go binaries are production-safe runtime skeletons. They intentionally do not consume Kafka or mutate data yet. Add adapters incrementally behind feature flags and keep shadow/read-only behavior until parity is proven.
