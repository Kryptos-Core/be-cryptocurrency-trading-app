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
