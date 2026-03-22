# Kryptos Core — Backend API

API backend cho nền tảng giao dịch tiền mã hóa, xây dựng bằng **NestJS**. Toàn bộ route REST nằm dưới prefix **`/api/v1`**.

## Tính năng chính

| Nhóm | Mô tả |
|------|--------|
| **Auth & người dùng** | JWT, đăng ký/đăng nhập, RBAC, 2FA (email OTP) |
| **Thị trường** | Cặp giao dịch, đồng bộ catalog từ Binance (testnet/mainnet theo cấu hình) |
| **Lệnh & sổ lệnh** | Đặt/hủy lệnh, order book, market maker batch |
| **Khớp lệnh** | Engine price–time priority, Redis lock, thực thi giao dịch |
| **Ví** | Số dư nội bộ, đối soát, đồng bộ ví ngoài (Binance) theo cấu hình |
| **Nạp/rút** | Nạp fiat qua **PayOS**, nạp/rút on-chain (TRON, Ethereum, Solana testnet) |
| **Kho bạc (Treasury)** | Ví giao dịch, sweep, thao tác vận hành (RBAC) |
| **Realtime** | WebSocket (Socket.IO) — giá, trading |
| **Thông báo** | Firebase Admin (FCM) |

OHLCV/ticker có thể lấy từ Binance public API theo cấu hình (`EXCHANGE_MODE`, testnet, v.v.).

## Công nghệ

- **Runtime:** Node.js (khuyến nghị LTS 20+)
- **Framework:** NestJS 10
- **ORM:** TypeORM 0.3 + **MySQL 8** — hướng dẫn tầng data access (Repository / `DataSource` / stored procedure): [`docs/DATA_ACCESS_PATTERNS.md`](docs/DATA_ACCESS_PATTERNS.md)
- **Cache / lock / queue:** Redis 7, **Bull** (hàng đợi)
- **Realtime:** `@nestjs/websockets`, Socket.IO
- **Khác:** JWT, PayOS, Ethers, TronWeb, Solana web3, Cloudinary, Nodemailer, Firebase Admin

## Yêu cầu

- Node.js + npm
- MySQL 8 và Redis 7 (có thể chạy bằng Docker — xem bên dưới)

## Chạy nhanh (local)

### 1. Hạ tầng (MySQL + Redis)

Từ thư mục backend, tạo `.env` từ `env.example` và chỉnh `DB_*`, `REDIS_*` cho khớp với Docker (hoặc instance local của bạn).

```bash
docker compose -f docker-compose.infrastructure.yml --env-file .env up -d
```

Compose khởi chạy **mysql:8.0** và **redis:7-alpine** (mật khẩu Redis qua `REDIS_PASSWORD` trong `.env`).

### 2. Cài đặt & database

```bash
npm install
cp env.example .env
# Chỉnh .env (DB, Redis, JWT, Binance, PayOS, blockchain, …)

npm run migration:run
npm run db:seed
npm run start:dev
```

### 3. Kiểm tra

- **API:** `http://127.0.0.1:3000/api/v1`
- **Health:** `GET http://127.0.0.1:3000/api/v1/health`
- **Swagger (không bật khi `NODE_ENV=production`):** `http://127.0.0.1:3000/api/docs`

## Biến môi trường

- Mẫu đầy đủ: [`env.example`](env.example)
- **Không** commit file `.env` hoặc khóa thật lên git.

Các nhóm quan trọng: `DB_*`, `REDIS_*`, `JWT_*`, Binance testnet/mainnet, `PAYOS_*`, blockchain RPC & hot wallet keys, `FIREBASE_*` (push), SMTP (2FA).

## Scripts npm

| Lệnh | Mô tả |
|------|--------|
| `npm run start:dev` | Dev watch mode |
| `npm run build` / `npm run start:prod` | Build & chạy production |
| `npm run migration:run` / `migration:revert` | TypeORM migrations |
| `npm run db:seed` | Seed dữ liệu + tài khoản thử |
| `npm test` | Jest |
| `npm run treasury:daily` | E2E treasury + health (dev/hardening) |

Đăng ký Windows Task Scheduler (treasury): `npm run treasury:schedule:register` — chi tiết trong `docs/TREASURY_DAILY_RUNBOOK.md`.

## Luồng khởi động ứng dụng

1. Load modules, middleware, CORS, validation pipe, interceptor.
2. **Market catalog:** nếu DB trống, bootstrap đồng bộ currencies/markets từ Binance; thất bại có thể **fail-fast** để không chạy thiếu dữ liệu thị trường.
3. `POST /api/v1/exchange/sync-info` vẫn dùng để admin làm mới catalog thủ công.

## Cấu trúc thư mục

```
be-cryptocurrency-trading-app/
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   ├── common/          # guards, filters, interceptors, RBAC, …
│   ├── config/
│   ├── entities/
│   ├── migrations/
│   ├── modules/         # auth, users, currencies, markets, exchange,
│   │                    # orders, matching, wallets, deposits, blockchain,
│   │                    # trading, redis, price-oracle, dashboard,
│   │                    # notifications, treasury, market-maker,
│   │                    # managed-wallets, payment-config, …
│   ├── seed/
│   └── utils/
├── docs/
├── postman/
├── scripts/
├── env.example
├── docker-compose.infrastructure.yml
└── package.json
```

## Tài liệu thêm

- [Redis Usage](docs/REDIS_USAGE.md)
- [Swagger](docs/SWAGGER_USAGE.md) · [Env / biến môi trường](docs/ENV_CONFIG_USAGE.md)
- [Base Repository Usage](docs/BASE_REPOSITORY_USAGE.md)
- [Treasury daily runbook](docs/TREASURY_DAILY_RUNBOOK.md)
- Mẫu env E2E treasury: `scripts/treasury-e2e.env.example`

## PayOS (nạp fiat)

Luồng nằm trong module **deposits**. Production bắt buộc cấu hình đủ biến PayOS. Webhook: `POST /api/v1/deposits/payos-webhook` (xem Swagger).

## Đối soát / báo cáo

- Export JSON (RBAC ADMIN / RISK_OFFICER): `POST /api/v1/wallets/reconciliation-report/export?limit=100` → `reports/reconciliation/YYYY-MM-DD.json`

## Tài khoản sau seed

| Email | Mật khẩu | Vai trò |
|-------|----------|---------|
| max@circle-vn.com | Admin@123! | Admin |
| hoangsondz1910@gmail.com | Trader@123! | Trader |
| trader2@example.com | Trader@123! | Trader |
| trader3@example.com | Trader@123! | Trader |
| guest@example.com | Guest@123! | Guest |
| verified@example.com | Verified@123! | Đã xác minh |
| hsondz1910@gmail.com | Risk@123! | Risk Officer |
| support@example.com | Support@123! | Support |
| maxnoah901@gmail.com | Maker@123! | Market Maker |
| finance@circle-vn.com | Finance@123! | Finance Manager |

## Database (dev)

- **Seed users** (xóa dữ liệu user-related rồi import lại từ `src/seed/data/users.json`): `npm run db:seed`
- **Xóa toàn bộ dữ liệu** trong DB hiện tại (TRUNCATE mọi bảng, **giữ** bảng `migrations` và cấu trúc schema): `npm run db:clean`  
  Trên **production**, lệnh bị chặn trừ khi đặt `ALLOW_DB_CLEAN=true` trong môi trường.

## Frontend

Ứng dụng Flutter nằm ở repo **`fe-cryptocurrency-trading-app`** (cùng solution). Cấu hình `BASE_URL` trỏ tới `http://127.0.0.1:3000/api/v1` (hoặc `http://10.0.2.2:3000/api/v1` trên Android emulator).
