# Cấu hình Binance Testnet - Dự án hiện tại

## 1. Các biến môi trường cần thiết cho testnet

Thiết lập trong file `.env.development` (hoặc `.env.<NODE_ENV>` tương ứng):

```env
TRADING_ENVIRONMENT=testnet
EXCHANGE_MODE=binance
BINANCE_TESTNET_ENABLED=true
BINANCE_TESTNET_API_KEY=...
BINANCE_TESTNET_API_SECRET=...
# Endpoint Spot testnet được sử dụng trong dự án này
BINANCE_TESTNET_BASE_URL=https://testnet.binance.vision
```

Nếu sử dụng futures testnet trong nhánh riêng của bạn, hãy cập nhật URL cơ sở tương ứng.

## 2. Hạ tầng & khởi động backend

MySQL và Redis (khuyến nghị):

```bash
cp .env.development.example .env.development
npm run docker:infra:up
```

Sau đó:

```bash
npm install
npm run migration:run
npm run db:seed
npm run start:dev
```

## 3. Xác minh API đã hoạt động

- API gốc: http://127.0.0.1:3000/api/v1
- Swagger: http://localhost:3000/api/docs

## 4. Endpoint đồng bộ hóa thủ công

Quản trị viên có thể kích hoạt:

- POST /api/v1/exchange/sync-info

Lưu ý:
- Endpoint yêu cầu JWT + vai trò admin + quyền `exchange:sync`.
- Ứng dụng cũng có luồng đồng bộ hóa tự động khi khởi tạo nếu danh mục thị trường đang trống.

## 5. Các endpoint ví hiện đang được hỗ trợ

- GET /api/v1/wallets
- GET /api/v1/wallets/balance?currencyId=<uuid>
- GET /api/v1/wallets/ledger?currencyId=<uuid>
- POST /api/v1/wallets/sync?currencyId=<uuid>
- GET /api/v1/wallets/exchange-balance?currencyId=<uuid>
- GET /api/v1/wallets/reconciliation-status?currencyId=<uuid>

Các endpoint cũ cho `process-deposit` và `create-withdrawal` đã bị loại bỏ.
