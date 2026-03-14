# CRYPTOCURRENCY TRADING APP (Backend)

NestJS API: auth, users, currencies, markets, wallets, exchange (Binance), WebSocket trading.

**OHLCV / ticker:** Chart and 24h ticker data are fetched on-demand from **Binance only** (public API, no API key). Suited for a free demo long-term; Uniswap/The Graph are not used.

---

## Cấu trúc thư mục

```
be-cryptocurrency-trading-app/
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   ├── common/           # decorators, enums, exceptions, filters, guards, interceptors, repositories, services
│   ├── config/           # app, env, redis, swagger, typeorm
│   ├── entities/         # TypeORM entities
│   ├── migrations/       # DB migrations
│   ├── modules/
│   │   ├── auth/         # login, register, JWT
│   │   ├── users/
│   │   ├── currencies/
│   │   ├── markets/
│   │   ├── wallets/
│   │   ├── exchange/     # Binance, mock
│   │   ├── trading/      # WebSocket gateway, price feed
│   │   └── redis/
│   ├── seed/             # run-seed, data (json)
│   └── utils/
├── database/             # SQL seed (legacy)
├── docs/                 # Tài liệu API, setup
├── postman/
├── scripts/
├── env.example
├── package.json
├── tsconfig.json
└── docker-compose.infrastructure.yml
```

**Module:** mỗi module có `*.controller`, `*.module`, `*.service`, `dto/`, `repositories/` (nếu cần).

---

## Chạy

```bash
npm install
cp env.example .env
npm run start:dev
```

Swagger: `http://localhost:3000/api`

## Seed DB & tài khoản test

Chạy seed để nạp dữ liệu mẫu người dùng:

```bash
npm run db:seed
```

Sau đó khởi động backend. Nếu DB đang rỗng ở phần market catalog, backend sẽ tự:

1. Sync dữ liệu thật từ Binance vào `currencies` và `market_pairs`.
2. Giữ `POST /exchange/sync-info` như một admin refresh action, không phải bước bắt buộc để app usable.

**Fail-fast:** nếu DB catalog rỗng và không sync được Binance khi startup, backend sẽ dừng khởi động để tránh chạy trong trạng thái không có thị trường giao dịch.

**Tài khoản test (đăng nhập ngay sau khi seed):**

| Email | Password | Ghi chú |
|-------|----------|---------|
| admin@example.com | Admin@123! | Admin |
| trader1@example.com | Trader@123! | Trader 1 |
| trader2@example.com | Trader@123! | Trader 2 |
| trader3@example.com | Trader@123! | Trader 3 |

**Lưu ý:** Nếu FE/Postman nhận **401 Invalid credentials** khi login, cần chạy `npm run db:seed` trước (để tạo user trong DB). Backend so sánh mật khẩu bằng bcrypt; email không phân biệt hoa thường.
