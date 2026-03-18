# ỨNG DỤNG GIAO DỊCH TIỀN ĐIỆN TỬ (Backend)

Backend API được xây dựng bằng NestJS, cung cấp:
- Xác thực (Auth) và người dùng (users)
- Tiền tệ (Currencies), thị trường (markets), lệnh (orders), khớp lệnh (matching)
- Ví (Wallets) và đồng bộ hóa với Binance
- Nạp tiền fiat qua PayOS
- Liên kết ví Blockchain và chuyển khoản on-chain
- Websocket giao dịch và dữ liệu giá

OHLCV và ticker được lấy trực tiếp (on-demand) từ Binance public API.

## Cấu trúc thư mục

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
|-- docker-compose.infrastructure.yml
```

## Chạy nhanh

```bash
npm install
cp env.example .env
npm run migration:run
npm run db:seed
npm run start:dev
```

API gốc: http://127.0.0.1:3000/api/v1

Swagger (không dùng cho production): http://localhost:3000/api/docs

## Luồng khởi chạy hiện tại

1. Ứng dụng khởi tạo các modules và middleware global.
2. Market catalog bootstrap sẽ tự động đồng bộ hóa currencies/markets từ Binance nếu catalog trong DB đang trống.
3. Nếu đồng bộ hóa thất bại khi catalog trống, ứng dụng sẽ dừng ngay (fail-fast) để tránh vận hành trong trạng thái thiếu dữ liệu thị trường.
4. Endpoint POST /api/v1/exchange/sync-info vẫn được giữ để admin làm mới thủ công.

## Lưu ý về PayOS

- Luồng nạp tiền fiat nằm ở module deposits.
- Các endpoint chính:
	- POST /api/v1/deposits
	- GET /api/v1/deposits
	- POST /api/v1/deposits/payos-webhook
- Trong môi trường production, ứng dụng bắt buộc phải có đầy đủ các biến môi trường (env) của PayOS.

## Kiểm tra kho bạc hàng ngày (Daily Treasury Hardening - Phát triển)

- Chạy E2E nạp/rút + kiểm tra sức khỏe (health check):

```bash
npm run treasury:daily
```

- Hướng dẫn chi tiết (Runbook): `docs/TREASURY_DAILY_RUNBOOK.md`

- Đăng ký Windows Task Scheduler:

```bash
npm run treasury:schedule:register
```

- Mẫu env tùy chọn cho full treasury E2E:
	- `scripts/treasury-e2e.env.example`

- Các giá trị mặc định cho môi trường dev trong scheduler runner:
	- `TREASURY_E2E_ALLOW_SKIP=true`
	- `TREASURY_HEALTH_FAIL_ON_CRITICAL=false`

- Xuất lịch sử đối soát định dạng JSON (RBAC: ADMIN/RISK_OFFICER):
	- `POST /api/v1/wallets/reconciliation-report/export?limit=100`
	- đầu ra: `reports/reconciliation/YYYY-MM-DD.json`

## Tài khoản thử nghiệm sau khi seed

| Email | Mật khẩu | Vai trò |
|---|---|---|
| max@circle-vn.com | Admin@123! | Quản trị viên (Admin) |
| hoangsondz1910@gmail.com | Trader@123! | Nhà giao dịch (Trader) |
| trader2@example.com | Trader@123! | Nhà giao dịch (Trader) |
| trader3@example.com | Trader@123! | Nhà giao dịch (Trader) |
| guest@example.com | Guest@123! | Khách (Guest) |
| verified@example.com | Verified@123! | Người dùng đã xác minh |
| hsondz1910@gmail.com | Risk@123! | Cán bộ rủi ro (Risk Officer) |
| support@example.com | Support@123! | Nhân viên hỗ trợ |
| maxnoah901@example.com | Maker@123! | Nhà tạo lập thị trường (Market Maker) |
