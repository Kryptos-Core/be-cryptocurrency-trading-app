# Kryptos Core — Backend API

> Last reviewed: 2026-07-29 — verified against `package.json`, `.env.development.example`, `src/modules/`, `docker-compose.yml`, `docker-compose.infrastructure.yml`, `go-services/`.

API backend cho nền tảng giao dịch tiền mã hóa (**NestJS**). Base path: `/api/v1`.

## Tính năng chính

- Đăng ký / đăng nhập, JWT, phân quyền theo vai trò, 2FA qua email
- Thị trường, lệnh, khớp lệnh, ví nội bộ và đồng bộ sàn
- Nạp / rút (fiat qua PayOS, on-chain)
- Liên kết ví & WalletConnect
- Kho bạc (treasury), thông báo push, realtime WebSocket

Kiến trúc chi tiết: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Yêu cầu

- **Node.js** 20+
- **PostgreSQL 16** + **Redis 7** (chạy qua Docker)

## Cài đặt và chạy

### 1. Infrastructure (Docker)

Compose file chính ở repo root (`docker-compose.yml`) include `docker-compose.infrastructure.yml` và thêm 3 Go services (`market-aggregator`, `matching-engine`, `public-ws-gateway`) trong profile `services`.

```bash
# Chỉ infrastructure (Postgres + Redis) — npm script wrapper
npm run docker:infra:up
npm run docker:infra:up:full   # + Kafka + ClickHouse + TimescaleDB
npm run docker:infra:down      # Tắt

# Hoặc dùng docker compose trực tiếp (tương đương)
docker compose -f docker-compose.yml up -d
docker compose -f docker-compose.yml --profile kafka --profile clickhouse --profile timescale up -d

# Khởi động luôn 3 Go services (profile services)
docker compose -f docker-compose.yml up -d --profile services
```

Xem chi tiết tại [go-services/README.md](go-services/README.md) và [docs/GO_SERVICES_PRODUCTION_ROLLOUT.md](docs/GO_SERVICES_PRODUCTION_ROLLOUT.md).

### 2. Biến môi trường

Tạo file `.env.development` từ `.env.development.example`. **Không commit file chứa secret.**

### 3. Cài đặt, migration, seed, chạy

```bash
npm install
npm run db:migrate
npm run db:seed
npm run dev          # nest start --watch với NODE_ENV=development
```

Lưu ý: script dev trong `package.json` là `npm run dev` (không còn `start:dev`). Các lệnh migration/seed cũng đã đổi tên: `db:migrate` / `db:migrate:revert`, `db:seed` / `db:clean`. Chi tiết: `docs/MIGRATION_CHECKLIST.md`, `docs/ENV_CONFIG_USAGE.md`.

## Scripts quan trọng

| Script | Mô tả |
|--------|--------|
| `npm run dev` | Dev server (NODE_ENV=development, `nest start --watch`) |
| `npm run start:prod` | Production (sau khi `npm run build`) |
| `npm run start:staging` | Staging (`nest start` không watch) |
| `npm run db:migrate` / `db:migrate:revert` / `db:migrate:show` | TypeORM migrations (development) |
| `npm run db:migrate:prod` | Migrations trong container production |
| `npm run db:seed` / `db:clean` | Seed / truncate data |
| `npm run seed:encrypt` / `seed:decrypt` / `seed:encrypt:dry` | AES-256-GCM cho `users.json.enc` |
| `npm run test` / `test:cov` / `test:watch` | Jest unit + integration |
| `npm run lint` / `lint:fix` / `format` | **Biome** (không còn ESLint/Prettier) |
| `npm run lint:boundaries` | Module boundary guard (`scripts/check-module-boundaries.mjs`) |
| `npm run lint:uow` | Direct `dataSource.transaction` guard (`scripts/check-uow-policy.mjs`) |
| `npm run docker:infra:up` / `:up:full` / `:down` / `:logs` / `:health` | Docker compose infrastructure |
| `npm run treasury:e2e` / `treasury:health` / `treasury:daily` / `treasury:schedule:register` | Treasury runbook |
| `npm run deploy:prod:up` / `:build` / `:migrate` / `:full` | Production deploy |

## Kiểm tra nhanh

| | URL |
|--|-----|
| API | http://127.0.0.1:3000/api/v1 |
| Health | http://127.0.0.1:3000/api/v1/health |
| Swagger | http://127.0.0.1:3000/api/docs |

## Seed accounts (dev)

| Email | Mật khẩu | Vai trò |
|-------|----------|---------|
| admin@example.com | ChangeMeAdmin! | ADMIN |
| trader1@example.com | ChangeMeTrader! | TRADER |

## Ports mặc định

| Service | Port |
|---------|------|
| API | 3000 |
| PostgreSQL | 5432 |
| Redis | 6379 |
| Kafka | 9092 |
| Go — `market-aggregator` | 8080 |
| Go — `matching-engine` | 8081 |
| Go — `public-ws-gateway` | 8082 |

## Go Services (Gradual Migration)

Trong giai đoạn chuyển đổi sang Go, ba services `market-aggregator`, `matching-engine`, `public-ws-gateway` chạy song song với NestJS. Trên local dev / Windows, khuyến nghị dùng **unified Docker Compose** ở repo root:

```bash
# Infrastructure + 3 Go services
docker compose -f docker-compose.yml up -d --profile services

# Hoặc dùng wrapper Makefile (cross-platform)
cd go-services
make docker-up            # start tất cả
make docker-logs SERVICE=market-aggregator
```

Network `crypto-trading-network` được share giữa infrastructure containers và Go services. Production/Staging dùng compose riêng (`docker-compose.prod.yml`, `docker-compose.staging.yml`) — xem [docs/GO_SERVICES_PRODUCTION_ROLLOUT.md](docs/GO_SERVICES_PRODUCTION_ROLLOUT.md) và [go-services/README.md](go-services/README.md).
