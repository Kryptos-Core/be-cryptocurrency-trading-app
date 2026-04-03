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

Dữ liệu mẫu trong `src/seed/data/users.json`. Sau `npm run db:seed`, mỗi giá trị `UserRole` đều có ít nhất một user demo.

| Email | Mật khẩu | `UserRole` | Ghi chú |
|-------|----------|------------|---------|
| max@circle-vn.com | Admin@123! | `ADMIN` | |
| hoangsondz1910@gmail.com | Trader@123! | `TRADER` | |
| trader2@example.com | Trader@123! | `TRADER` | |
| trader3@example.com | Trader@123! | `TRADER` | |
| hsondz1910@gmail.com | Risk@123! | `RISK_OFFICER` | |
| support@example.com | Support@123! | `SUPPORT_AGENT` | |
| maxnoah901@gmail.com | Maker@123! | `MARKET_MAKER` | |
| camego8361@marvetos.com | Finance@123! | `FINANCE_MANAGER` | |
