# CRYPTOCURRENCY TRADING APP (Backend)

NestJS API: auth, users, currencies, markets, wallets, exchange (Binance), WebSocket trading.

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

---

## Seed DB & tài khoản test

Chạy seed để nạp dữ liệu mẫu (currencies, users, market pairs, OHLCV, wallets):

```bash
npm run db:seed
```

**Tài khoản test (đăng nhập ngay sau khi seed):**

| Email | Password | Ghi chú |
|-------|----------|---------|
| admin@example.com | Admin@123! | Admin |
| trader1@example.com | Trader@123! | Trader 1 |
| trader2@example.com | Trader@123! | Trader 2 |
| trader3@example.com | Trader@123! | Trader 3 |

**Lưu ý:** Nếu FE/Postman nhận **401 Invalid credentials** khi login, cần chạy `npm run db:seed` trước (để tạo user trong DB). Backend so sánh mật khẩu bằng bcrypt; email không phân biệt hoa thường.
