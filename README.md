# Kryptos Core — Backend API

> Last reviewed: 2026-07-28 — verified against `package.json`, `.env.development.example`, `src/modules/`, `docker-compose.infrastructure.yml`.

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

```bash
npm run docker:infra:up        # PostgreSQL + Redis
npm run docker:infra:up:full   # + Kafka + ClickHouse + TimescaleDB
npm run docker:infra:down      # Tắt
```

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
