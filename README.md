# CRYPTOCURRENCY TRADING APP (Backend)

Backend API duoc xay dung bang NestJS, cung cap:
- Auth va users
- Currencies, markets, orders, matching
- Wallets va Binance sync
- Deposits fiat qua PayOS
- Blockchain wallet linking va on-chain transfer
- Trading websocket va price data

OHLCV va ticker duoc lay on-demand tu Binance public API.

## Cau truc thu muc

```
be-cryptocurrency-trading-app/
|-- src/
|   |-- main.ts
|   |-- app.module.ts
|   |-- common/
|   |-- config/
|   |-- entities/
|   |-- migrations/
|   |-- modules/
|   |   |-- auth/
|   |   |-- users/
|   |   |-- currencies/
|   |   |-- markets/
|   |   |-- wallets/
|   |   |-- orders/
|   |   |-- matching/
|   |   |-- exchange/
|   |   |-- deposits/
|   |   |-- blockchain/
|   |   |-- price-oracle/
|   |   |-- trading/
|   |   `-- redis/
|   |-- seed/
|   `-- utils/
|-- docs/
|-- postman/
|-- scripts/
|-- env.example
|-- package.json
`-- docker-compose.infrastructure.yml
```

## Chay nhanh

```bash
npm install
cp env.example .env
npm run migration:run
npm run db:seed
npm run start:dev
```

API base: http://127.0.0.1:3000/api/v1

Swagger (non-production): http://localhost:3000/api/docs

## Startup flow hien tai

1. App khoi tao modules va middleware global.
2. Market catalog bootstrap se tu dong sync currencies/markets tu Binance neu DB catalog dang rong.
3. Neu sync that bai khi catalog rong, app fail-fast de tranh van hanh trong trang thai thieu du lieu thi truong.
4. Endpoint POST /api/v1/exchange/sync-info van duoc giu cho admin refresh thu cong.

## Luu y ve PayOS

- Luong nap fiat nam o module deposits.
- Cac endpoint chinh:
	- POST /api/v1/deposits
	- GET /api/v1/deposits
	- POST /api/v1/deposits/payos-webhook
- Trong production, app bat buoc co day du cac bien env PayOS.

## Daily Treasury Hardening (Development)

- Run E2E nap/rut + health check:

```bash
npm run treasury:daily
```

- Runbook chi tiet: `docs/TREASURY_DAILY_RUNBOOK.md`

- Dang ky Windows Task Scheduler:

```bash
npm run treasury:schedule:register
```

- Optional env template cho full treasury E2E:
	- `scripts/treasury-e2e.env.example`

- Dev defaults trong scheduler runner:
	- `TREASURY_E2E_ALLOW_SKIP=true`
	- `TREASURY_HEALTH_FAIL_ON_CRITICAL=false`

- Export reconcile history JSON (RBAC: ADMIN/RISK_OFFICER):
	- `POST /api/v1/wallets/reconciliation-report/export?limit=100`
	- output: `reports/reconciliation/YYYY-MM-DD.json`

## Tai khoan test sau khi seed

| Email | Password | Role |
|---|---|---|
| admin@example.com | Admin@123! | Admin |
| trader1@example.com | Trader@123! | Trader |
| trader2@example.com | Trader@123! | Trader |
| trader3@example.com | Trader@123! | Trader |
| guest@example.com | Guest@123! | Guest |
| verified@example.com | Verified@123! | Verified User |
| risk@example.com | Risk@123! | Risk Officer |
| support@example.com | Support@123! | Support Agent |
| maker@example.com | Maker@123! | Market Maker |
