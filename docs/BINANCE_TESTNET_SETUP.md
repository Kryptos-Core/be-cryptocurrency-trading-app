# Binance Testnet Setup - Current Project

## 1. Required env for testnet

Set in .env:

```env
TRADING_ENVIRONMENT=testnet
EXCHANGE_MODE=binance
BINANCE_TESTNET_ENABLED=true
BINANCE_TESTNET_API_KEY=...
BINANCE_TESTNET_API_SECRET=...
# Spot testnet endpoint used by this project
BINANCE_TESTNET_BASE_URL=https://testnet.binance.vision
```

If using futures testnet in your own branch, update base URL accordingly.

## 2. Start backend

```bash
npm install
npm run migration:run
npm run db:seed
npm run start:dev
```

## 3. Verify API is up

- API base: http://127.0.0.1:3000/api/v1
- Swagger: http://localhost:3000/api/docs

## 4. Manual sync endpoint

Admin can trigger:

- POST /api/v1/exchange/sync-info

Notes:
- Endpoint requires JWT + admin role + exchange:sync permission.
- App also has bootstrap sync path for empty market catalog.

## 5. Wallet endpoints currently supported

- GET /api/v1/wallets
- GET /api/v1/wallets/balance?currencyId=<uuid>
- GET /api/v1/wallets/ledger?currencyId=<uuid>
- POST /api/v1/wallets/sync?currencyId=<uuid>
- GET /api/v1/wallets/exchange-balance?currencyId=<uuid>
- GET /api/v1/wallets/reconciliation-status?currencyId=<uuid>

Legacy endpoints for process-deposit and create-withdrawal were removed.
