# Kryptos Core — Backend API

API backend cho nền tảng giao dịch tiền mã hóa, xây dựng bằng **NestJS**. Toàn bộ route REST nằm dưới prefix **`/api/v1`**.

## Tính năng chính

| Nhóm | Mô tả |
|------|--------|
| **Auth & người dùng** | JWT, đăng ký/đăng nhập, RBAC, 2FA (email OTP) |
| **Thị trường** | Cặp giao dịch, đồng bộ catalog từ Binance (testnet/mainnet theo cấu hình) |
| **Lệnh & sổ lệnh** | Đặt/hủy lệnh, order book, market maker batch |
| **Khớp lệnh** | Engine price–time priority, Redis lock (Lua atomic), STP (self-trade prevention), incremental in-memory book, audit log persistent (`trade_audit_log`), market order slippage protection, circuit breaker per pair |
| **Ví** | Số dư nội bộ, đối soát, đồng bộ ví ngoài (Binance) theo cấu hình |
| **Nạp/rút** | Nạp fiat qua **PayOS**, nạp/rút on-chain (TRON, Ethereum, Solana testnet) |
| **Liên kết ví & đăng nhập WC** | Đăng nhập public (QR + SignClient): `/auth/wallet/wc/*`. Liên kết ví (JWT): `/blockchain/wallets/wc/*` |
| **Kho bạc (Treasury)** | Ví giao dịch, sweep, thao tác vận hành (RBAC) |
| **Realtime** | WebSocket (Socket.IO) — giá, trading |
| **Thông báo** | Firebase Admin (FCM) |

OHLCV/ticker có thể lấy từ Binance public API theo cấu hình (`EXCHANGE_MODE`, testnet, v.v.).

## Yêu cầu

- Node.js + npm
- MySQL 8 và Redis 7 (có thể chạy bằng Docker — xem mục chạy local bên dưới)

## Công nghệ

- **Runtime:** Node.js (khuyến nghị LTS 20+)
- **Framework:** NestJS 10
- **ORM:** TypeORM 0.3 + **MySQL 8**
- **Cache / lock / queue:** Redis 7, **Bull** (hàng đợi)
- **Realtime:** `@nestjs/websockets`, Socket.IO
- **Khác:** JWT, PayOS, Ethers, TronWeb, Solana web3, Cloudinary, Nodemailer, Firebase Admin

## Chạy backend (local)

### 1. Hạ tầng (MySQL + Redis)

Từ thư mục backend, tạo `.env` từ `env.example` và chỉnh `DB_*`, `REDIS_*` cho khớp với Docker (hoặc instance local của bạn).

```bash
docker compose -f docker-compose.infrastructure.yml --env-file .env up -d
```

Compose khởi chạy **mysql:8.0** và **redis:7-alpine** (mật khẩu Redis qua `REDIS_PASSWORD` trong `.env`).

### 2. Cài đặt và database

```bash
npm install
cp env.example .env
# Chỉnh .env (DB, Redis, JWT, Binance, PayOS, blockchain, …)

npm run migration:run
npm run db:seed
npm run start:dev
```

## API, Health và Swagger

| | URL |
|---|-----|
| **Base API** | `http://127.0.0.1:3000/api/v1` |
| **Health** | `GET http://127.0.0.1:3000/api/v1/health` |
| **Swagger** | `http://127.0.0.1:3000/api/docs` (không bật khi `NODE_ENV=production`) |

## Biến môi trường

- Mẫu đầy đủ: `env.example` (copy thành `.env`).
- **Không** commit `.env` hoặc khóa thật lên git.

Các nhóm thường dùng: `DB_*`, `REDIS_*`, `JWT_*`, Binance testnet/mainnet, `PAYOS_*`, blockchain RPC & hot wallet keys, `WALLETCONNECT_PROJECT_ID` / `REOWN_PROJECT_ID`, `WALLETCONNECT_RELAY_URL`, `FIREBASE_*` (push), SMTP (2FA). Biến mà `ConfigService` đọc được phải khai báo trong whitelist `src/config/env.validation.ts`.

### Matching engine (queue + sổ lệnh)

- **Một worker** xử lý queue `matching` được khuyến nghị trong production; processor đã đặt `concurrency: 1` cho job khớp lệnh.
- **`MATCHING_BOOK_FULL_REFRESH`**: đặt `true` / `1` / `yes` nếu nhiều process cùng consume queue — mỗi lần `runMatch` reload sổ từ DB (tải DB hơn, giảm lệch in-memory). Mặc định để trống (tắt).
- **Migration `1775510000000`**: `npm run migration:revert` **không** hoàn tác migration này; cần backup hoặc tái tạo procedure/cột thủ công (xem JSDoc trong file migration).

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

## Tài khoản sau seed

Enum **`UserRole`** (cột `users.role`, claim `role` trong JWT): `ADMIN`, `TRADER`, `RISK_OFFICER`, `SUPPORT_AGENT`, `MARKET_MAKER`, `FINANCE_MANAGER` — định nghĩa tại `src/common/enums/index.ts`. **Không** có role `GUEST` trên server.

Mặc định seed đọc `src/seed/data/users.json` nếu có; nếu không, dùng [`src/seed/data/users.json.example`](src/seed/data/users.json.example). Có thể đặt `SEED_USERS_JSON` trỏ tới file khác. Mỗi user **bắt buộc** có trường `role`. Copy `users.json.example` → `users.json`, đổi mật khẩu trước khi dùng ngoài dev (file `users.json` được gitignore).

Sau `npm run db:seed`, mỗi giá trị `UserRole` trong file mẫu đều có ít nhất một user demo:

| Email | Mật khẩu (mẫu) | `UserRole` |
|-------|----------------|------------|
| admin@example.com | ChangeMeAdmin! | `ADMIN` |
| trader1@example.com | ChangeMeTrader! | `TRADER` |
| trader2@example.com | ChangeMeTrader! | `TRADER` |
| risk@example.com | ChangeMeRisk! | `RISK_OFFICER` |
| support@example.com | ChangeMeSupport! | `SUPPORT_AGENT` |
| maker@example.com | ChangeMeMaker! | `MARKET_MAKER` |
| finance@example.com | ChangeMeFinance! | `FINANCE_MANAGER` |
