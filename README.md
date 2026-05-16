# Kryptos Core — Backend API

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
npm run migration:run
npm run db:seed
npm run start:dev
```

## Scripts quan trọng

| Script | Mô tả |
|--------|--------|
| `npm run start:dev` | Dev server (NODE_ENV=development) |
| `npm run build && npm run start:prod` | Production |
| `npm run migration:run` / `migration:revert` | TypeORM migrations |
| `npm run db:seed` / `db:clean` | Seed / truncate data |
| `npm run test` | Unit + integration tests |
| `npm run lint` | Biome lint |

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
